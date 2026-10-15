/* Pixmax canvas integration. Document state and permission guards belong to the canvas. */
function isSmartStudioNode(node){
    return ['smart-director','smart-editor','smart-storyboard','smart-audio','smart-model'].includes(node?.type);
}

function smartStudioTitle(node){
    if(node.pixmaxSourceType==='BASE_3D')return node.title||'3D 模型';
    return node.title || {'smart-director':'导演台','smart-editor':'剪辑台','smart-storyboard':'分镜脚本','smart-audio':'音频生成节点','smart-model':'3D模型生成节点'}[node.type];
}

function pixmaxSvg(kind){return window.PixmaxCanvasAssets?.icons[kind] || '';}
function pixmaxMediaPoster(media){
    if(!media)return '';
    const preview=smartMediaPreviewUrl(media,768);
    const poster=media.poster||media.thumbnailUrl;
    return poster?displayMediaUrl(poster):(preview!==displayMediaUrl(media)?preview:'');
}
function syncPixmaxSaveStatus(){
    const button=document.querySelector('[data-pixmax-save]');if(!button)return;
    const pending=smartSaveInFlight?'正在保存画布':smartCanvasDirty?'有未保存的更改，点击保存':'画布已保存';
    button.setAttribute('aria-label',pending);button.title=pending;
    button.querySelector('circle')?.setAttribute('fill',smartSaveInFlight?'#aeb6c5':smartCanvasDirty?'#ffbd59':'#229c66');
}
function pixmaxNameWidth(title){
    const context=document.createElement('canvas').getContext('2d');context.font='12px Inter, system-ui, sans-serif';
    return Math.min(180,Math.max(16,context.measureText(title).width+2));
}
function pixmaxNodeCaption(node,kind,label){
    const title=node.label || (!node.generationKind&&node.images?.[0]?.name?node.images[0].name.replace(/\.[^.]+$/,''):label);
    return `<div class="generation-node-caption">${pixmaxSvg(kind)}<input class="pixmax-node-name" aria-label="节点名称" value="${escapeAttr(title)}" style="width:${pixmaxNameWidth(title)}px" ${isSmartCanvasLocked()?'readonly':''}>${window.PixmaxTags?.markup(node)||''}</div>`;
}
function pixmaxUniqueNodeLabel(base){
    const labels=new Set(nodes.map(node=>node.label||(node.type==='smart-prompt'?'文本生成节点':node.generationKind==='video'?'视频生成节点':node.generationKind==='image'?'图像生成节点':'')));
    if(!labels.has(base))return base;
    let suffix=1;while(labels.has(base+'-'+suffix))suffix++;return base+'-'+suffix;
}
function pixmaxNodePorts(){return `<div class="node-port port-in" data-port="in" title="输入连接" role="button" aria-label="输入连接">${pixmaxSvg('connect')}</div><div class="node-port port-out" data-port="out" title="输出连接" role="button" aria-label="输出连接">${pixmaxSvg('connect')}</div>`;}
function pixmaxNativeNodeType(node){
    if(node?.pixmaxSourceType==='BASE_3D')return 'Base3D';
    const native={'smart-prompt':'GenerateText','smart-director':'StageEditor','smart-editor':'VideoEditor','smart-storyboard':'StoryboardScript','smart-audio':'GenerateAudio','smart-model':'Generate3D'}[node?.type];
    if(native)return native;
    const kind=node?.generationKind||mediaKindForItem(node?.images?.[0]||{});
    return (node?.generationKind?'Generate':'Base')+({video:'Video',audio:'Audio',model:'3D'}[kind]||'Image');
}
function pixmaxConnectionMenuTypes(node,port){
    const kinds=window.PixmaxCanvasAssets.connectionRules[pixmaxNativeNodeType(node)]?.[port==='out'?'source':'target']||[];
    const menu={BaseText:'prompt',GenerateText:'prompt',BaseImage:'generate-image',GenerateImage:'generate-image',BaseAudio:'audio',GenerateAudio:'audio',BaseVideo:'generate-video',GenerateVideo:'generate-video',Base3D:'model',Generate3D:'model',StageEditor:'director',VideoEditor:'editor',StoryboardScript:'storyboard'};
    return new Set(kinds.map(kind=>menu[kind]).filter(Boolean));
}
function pixmaxCanConnect(from,to){return !!window.PixmaxCanvasAssets.connectionRules[pixmaxNativeNodeType(from)]?.source.includes(pixmaxNativeNodeType(to));}

const PIXMAX_VIDEO_DEFERRED=new Set(['continuation','erase','upscale']);
function pixmaxVideoToolbarActions(node){
    const item=node?.images?.[smartNodeToolbarImageIndex(node)]||{};
    const editing=!isSmartCanvasLocked();
    const local=/^\/(assets|output)\//.test(item.url||'');
    const later=(key,label,icon)=>({key,label,icon,enabled:false,hint:label+' · 后续接入',deferred:true});
    return [
        {key:'trim',label:'剪辑',icon:'scissors',enabled:editing&&local,hint:!editing?'请先开始编辑画布':!local?'剪辑仅支持已入库的视频':'剪辑'},
        {key:'compliance',label:'合规检测',icon:'shield-check',enabled:editing,hint:editing?'提交素材库认证，审核通过后用于视频生成':'请先开始编辑画布'},
        {key:'annotation',label:'标记',icon:'pencil',enabled:editing,hint:editing?'标记视频画面':'请先开始编辑画布'},
        later('continuation','智能续写','history'),{key:'reshoot',label:'片段重拍',icon:'camera',enabled:editing&&!!window.PixmaxSegmentReshoot?.available(),hint:!editing?'请先开始编辑画布':window.PixmaxSegmentReshoot?.available()?'选择片段并使用 Seedance 2.5 视频编辑':'请在成员画布中配置 Seedance 2.5 视频编辑模型'},
        {key:'parse',label:'解析',icon:'layout-grid',enabled:editing&&!!window.CanvasSession?.enabled&&pixmaxChatProviders().length>0,hint:editing&&window.CanvasSession?.enabled?'将视频解析为分镜脚本':'请在成员画布中开始编辑并配置可用文本模型'},later('erase','字幕擦除','captions'),later('upscale','超分','scan'),
        {key:'depth-video',label:'深度视频',icon:'layers',enabled:editing,hint:editing?'深度视频 · 本地提取':'请先开始编辑画布'},
        {key:'audio-separate',label:'音频分离',icon:'audio-lines',enabled:editing,hint:editing?'音频分离 · 提取静音视频和音轨':'请先开始编辑画布'},
        {key:'tags',label:'标签',icon:'tag',enabled:true,compact:true}, {key:'video-history',label:'生成历史',icon:'history',enabled:!!window.CanvasSession?.enabled,compact:true,hint:window.CanvasSession?.enabled?'查看生成素材历史':'请在成员画布中查看生成历史'},
        {key:'download',label:'下载',icon:'download',enabled:true,compact:true},
        {key:'preview',label:'放大预览',icon:'maximize-2',enabled:true,compact:true},
        {key:'asset',label:'保存到资产库',icon:'library-big',enabled:editing,compact:true}
    ];
}
function pixmaxVideoToolbarHtml(node){
    const actions=pixmaxVideoToolbarActions(node);
    return `<div class="smart-node-floating-menu pixmax-video-toolbar" data-smart-node-menu="1" role="toolbar" aria-label="视频节点工具"><div class="pixmax-video-toolbar-scroll">${actions.map(action=>`${action.key==='tags'?'<span class="pixmax-video-toolbar-divider" aria-hidden="true"></span>':''}<button type="button" data-smart-node-action="${action.key}" data-node-id="${escapeAttr(node.id)}" ${action.enabled?'':'disabled'} ${action.deferred?'data-deferred="true"':''} aria-label="${escapeAttr(action.label)}" title="${escapeAttr(action.hint||action.label)}">${pixmaxSvg('video-tool-'+action.key)||`<i data-lucide="${action.icon}"></i>`}${action.compact?'':`<span>${action.label}</span>`}</button>`).join('')}</div></div>`;
}
function positionPixmaxVideoToolbars(){
    if(!shell||!world)return;
    const scale=safeScale(viewport.scale),bounds=shell.getBoundingClientRect();
    shell.style.setProperty('--pixmax-toolbar-scale',1/scale);
    shell.style.setProperty('--pixmax-toolbar-width',Math.max(200,bounds.width-24)+'px');
    world.querySelectorAll('.image-node.selected .smart-node-floating-menu').forEach(toolbar=>{
        const card=toolbar.parentElement.getBoundingClientRect(),center=card.left+card.width/2;
        const half=toolbar.offsetWidth/2;
        const x=Math.max(bounds.left+half+12,Math.min(center,bounds.right-half-12));
        toolbar.style.marginLeft=(x-center)/scale+'px';
        const below=card.top-60<Math.max(bounds.top,56);
        toolbar.style.top=below?'auto':-60/scale+'px';
        toolbar.style.bottom=below?-52/scale+'px':'auto';
        toolbar.style.transformOrigin=below?'center top':'center bottom';
    });
}
let pixmaxVideoDepthMenu;
function closePixmaxVideoDepthMenu(){
    if(!pixmaxVideoDepthMenu)return;
    const {root,outside,escape,anchor}=pixmaxVideoDepthMenu;
    root.remove();document.removeEventListener('pointerdown',outside,true);document.removeEventListener('keydown',escape,true);
    anchor?.setAttribute('aria-expanded','false');pixmaxVideoDepthMenu=null;
}
function openPixmaxVideoDepthMenu(nodeId,index){
    if(pixmaxVideoDepthMenu?.nodeId===nodeId){closePixmaxVideoDepthMenu();return;}
    closePixmaxVideoDepthMenu();
    const node=nodes.find(node=>node.id===nodeId),item=node?.images?.[index];if(!item||isSmartCanvasLocked())return;
    const origin=canvas,epoch=window.MemberCanvasEdit?.active?.lease?.epoch,url=item.url;
    const valid=()=>canvas===origin&&nodes.includes(node)&&node.images?.[index]===item&&item.url===url&&!isSmartCanvasLocked()&&window.MemberCanvasEdit?.active?.lease?.epoch===epoch;
    const config=window.LocalDepthVideo.getSettings();
    const root=document.createElement('section');root.className='pixmax-video-depth-menu';root.setAttribute('role','dialog');root.setAttribute('aria-label','深度视频参数');
    root.innerHTML=`<header><strong>深度视频</strong><button type="button" aria-label="关闭深度视频参数">×</button></header><dl><dt>模型</dt><dd>Depth Anything V2 Small · fp16</dd><dt>分辨率</dt><dd>${Number(config.resolution)}px</dd><dt>帧率</dt><dd>${Number(config.fps)} fps</dd><dt>深度样式</dt><dd>灰度</dd></dl><p>在浏览器本地逐帧提取。</p><p>首次执行需加载模型，逐帧推理耗时较长。</p><footer><button type="button" data-depth-settings>调整参数</button><button type="button" data-depth-start>开始提取</button></footer>`;
    document.body.appendChild(root);
    const anchor=world.querySelector(`[data-node-id="${CSS.escape(nodeId)}"][data-smart-node-action="depth-video"]`);
    const rect=anchor?.getBoundingClientRect()||{left:innerWidth/2,top:innerHeight/2,bottom:innerHeight/2};
    root.style.left=Math.max(12,Math.min(rect.left,innerWidth-root.offsetWidth-12))+'px';
    root.style.top=(rect.bottom+8+root.offsetHeight<innerHeight?rect.bottom+8:Math.max(12,rect.top-root.offsetHeight-8))+'px';
    anchor?.setAttribute('aria-expanded','true');
    const outside=event=>{if(!root.contains(event.target)&&!anchor?.contains(event.target))closePixmaxVideoDepthMenu();};
    const escape=event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();closePixmaxVideoDepthMenu();anchor?.focus({preventScroll:true});}};
    pixmaxVideoDepthMenu={root,outside,escape,anchor,nodeId};
    document.addEventListener('pointerdown',outside,true);document.addEventListener('keydown',escape,true);
    root.addEventListener('keydown',event=>event.stopPropagation());
    root.querySelector('header button').onclick=closePixmaxVideoDepthMenu;
    root.querySelector('[data-depth-settings]').onclick=()=>{closePixmaxVideoDepthMenu();if(valid())window.LocalDepthVideo.openSettings();};
    root.querySelector('[data-depth-start]').onclick=()=>{closePixmaxVideoDepthMenu();if(valid())startSmartLocalDepthVideo(nodeId,index);};
    root.querySelector('[data-depth-start]').focus({preventScroll:true});
}
window.addEventListener('pagehide',closePixmaxVideoDepthMenu);
function bindPixmaxNodeName(el,node){
    const input=el.querySelector('.pixmax-node-name');if(!input)return;
    input.addEventListener('mousedown',event=>event.stopPropagation());
    input.addEventListener('click',event=>event.stopPropagation());
    input.addEventListener('input',()=>input.style.width=pixmaxNameWidth(input.value)+'px');
    input.addEventListener('keydown',event=>{event.stopPropagation();if(event.key==='Enter')input.blur();});
    input.addEventListener('change',()=>{if(isSmartCanvasLocked()||!nodes.includes(node))return;const label=input.value.trim();if(label!==node.label){pushUndo();node.label=label;scheduleSave();window.PixmaxNavigator?.documentChanged();}});
}
async function captureSmartPixmaxFrames(id,frames){
    const owner=nodes.find(node=>node.id===id),origin=canvas,epoch=window.MemberCanvasEdit?.active?.lease?.epoch;
    const valid=()=>canvas===origin&&nodes.includes(owner)&&!isSmartCanvasLocked()&&epoch===window.MemberCanvasEdit?.active?.lease?.epoch;
    if(!owner||!valid())return;
    const files=frames.map(frame=>new File([frame.blob],frame.fileName,{type:frame.blob.type}));
    const uploaded=await uploadFiles(files);if(!valid())return;
    if(uploaded.length!==files.length)throw new Error('截图上传失败');
    pushUndo();uploaded.forEach((item,index)=>{const result=createNode(owner.x+nodeRect(owner).width+80,owner.y+index*240,[item],{skipUndo:true,select:false});result.label=(owner.label||'视频节点')+'-截帧';connectInputNode(owner.id,result.id);});
    render();scheduleSave();toast('截图已插入画布');
}

function createSmartStudioNode(kind, point, options={}){
    if(isSmartCanvasLocked()) return;
    if(!options.skipUndo)pushUndo();
    const type = 'smart-'+kind;
    const [w,h]=window.PixmaxCanvasAssets.sizes[kind];
    const node = {id:uid(kind),type,x:point.x-w/2,y:point.y-h/2,w,h,images:[],created_at:Date.now()};
    if(kind === 'storyboard') node.shots = [];
    nodes.push(node);
    if(options.select!==false)smartSelection.createdNode(node.id);
    if(!options.deferRender){render(); scheduleSave();}
    return node;
}

function renderSmartStudioNode(node){
    const rect = imageLayout([],1,node);
    const kind = node.type.slice(6);
    const baseModel=node.pixmaxSourceType==='BASE_3D';
    const label = baseModel?'打开模型':{director:'编辑场景',editor:'编辑剪辑',storyboard:'打开分镜节点 →',audio:'生成音频',model:'生成 3D 模型'}[kind];
    const media = node.studioPreview || (['audio','model'].includes(kind)?node.images?.at(-1):node.images?.[0]);
    const previewUrl=media&&(kind==='editor'?pixmaxMediaPoster(media):mediaKindForItem(media)==='image'?displayMediaUrl(media):'');
    const hasPreview=Boolean(previewUrl);
    const body = kind==='model'&&media?`<div class="pixmax-model-result">${pixmaxSvg('model')}<button type="button" data-studio-model-preview="${node.images.length-1}">预览 3D 模型</button><small>${escapeHtml(media.name||'生成模型')}</small></div>`:kind==='audio'&&media?pixmaxAudioCardHtml(media,node.images.length-1):hasPreview ? `<img class="pixmax-studio-preview" src="${escapeAttr(previewUrl)}" alt="${escapeAttr(smartStudioTitle(node))}">` : kind==='storyboard'?`<div class="pixmax-storyboard-card">${pixmaxSvg('storyboard')}<div class="pixmax-steps"><span class="active"><em>✓</em><small>确认镜头</small></span><b></b><span><em>2</em><small>准备资产</small></span><b></b><span><em>3</em><small>生成提示词</small></span></div><button type="button" data-studio-open>打开分镜节点 →</button></div>`:`<div class="pixmax-studio-placeholder">${pixmaxSvg(kind==='audio'?'audio-fill':kind==='editor'?'editor-fill':kind==='director'?'director-fill':'model')}</div>`;
    return `<div class="image-node pixmax-studio-node ${isNodeSelected(node.id)?'selected':''}" data-id="${escapeAttr(node.id)}" style="left:${node.x}px;top:${node.y}px;width:${rect.width}px;height:${rect.height}px">
        ${pixmaxNodeCaption(node,kind,smartStudioTitle(node))}
        <div class="node-body">${body}</div><div class="node-resize-handle" data-resize="1"></div>
        ${['director','editor','storyboard'].includes(kind)?pixmaxNodePorts().replace(/<div class="node-port port-out"[\s\S]*$/,''):pixmaxNodePorts()}
        ${kind==='storyboard'?'':`<div class="pixmax-studio-launcher"><button type="button" data-studio-open ${isSmartCanvasLocked()&&!baseModel?'disabled':''}>${['audio','model'].includes(kind)&&smartPendingTasks(node).some(task=>task.kind===kind)?kind==='model'?'查询 3D 任务':'查询音频任务':label}</button>${['audio','model'].includes(kind)?`<button type="button" data-studio-upload ${isSmartCanvasLocked()?'disabled':''}>${kind==='model'?'上传模型':'上传音频'}</button>`:''}${kind==='model'&&!baseModel&&media?.url?`<button type="button" data-studio-history aria-label="生成历史" title="生成历史" ${window.CanvasSession?.enabled?'':'disabled'}><i data-lucide="history" aria-hidden="true"></i></button>`:''}<button type="button" class="pixmax-studio-more" data-studio-menu aria-label="节点操作">···</button></div>`}
    </div>`;
}

function pixmaxAudioCardHtml(media,index=0){
    return `<div class="pixmax-audio-card"><div class="pixmax-audio-mount" data-audio-key="${escapeAttr(JSON.stringify([index,media.url]))}" data-src="${escapeAttr(displayMediaUrl(media))}" data-url="${escapeAttr(media.url)}" data-audio-name="${escapeAttr(media.name||'音频')}"></div></div>`;
}

function bindSmartStudioNode(el,node){
    bindPixmaxNodeName(el,node);
    const history=el.querySelector('[data-studio-history]');
    history?.addEventListener('mousedown',event=>event.stopPropagation());
    history?.addEventListener('click',event=>{event.preventDefault();event.stopPropagation();window.PixmaxGenerationHistory?.openNode(node,history);});
    for(const button of el.querySelectorAll('[data-studio-audio-play],[data-studio-model-preview],[data-studio-upload]')){
        button.addEventListener('mousedown',event=>event.stopPropagation());
        button.addEventListener('click',event=>{event.stopPropagation();if(button.hasAttribute('data-studio-audio-play'))openSmartAudioLightbox(node.id,Number(button.dataset.studioAudioPlay));else if(button.hasAttribute('data-studio-model-preview'))window.PixmaxModelPreview.open(node,Number(button.dataset.studioModelPreview));else if(!isSmartCanvasLocked())uploadSmartStudioMedia(node);});
    }
    el.querySelector('[data-studio-menu]')?.addEventListener('click',event=>{event.stopPropagation();openSmartCanvasContext(event,node);});
    el.querySelectorAll('[data-studio-open]').forEach(button => {
        button.addEventListener('mousedown', event=>event.stopPropagation());
        button.addEventListener('click', event=>{event.stopPropagation();if(Date.now()<suppressNodeClickUntil)return;openSmartStudio(node.id);});
    });
}

function smartStudioResources(owner, all=false){
    const incoming = new Set((canvas.connections || []).filter(edge=>edge.to===owner.id || edge.target===owner.id).map(edge=>edge.from || edge.source));
    return nodes.filter(node=>node!==owner && (all || incoming.has(node.id))).flatMap(node=>(node.images || []).map((item,index)=>({
        id:node.id+':'+index,name:item.name || node.title || '素材',
        kind:node.type==='smart-model'?'model':mediaKindForItem(item),url:displayMediaUrl(item),previewUrl:pixmaxMediaPoster(item)
    }))).filter(item=>['image','video','audio','model'].includes(item.kind));
}

// Persist the source address, then restore the current member's playback address.
// The native editor removes clips whose resource URL is absent from importResources.
function pixmaxStudioDocumentUrls(document, owner, playback){
    if(!document)return document;
    const aliases=new Map();
    const incoming=new Set((canvas.connections||[]).filter(edge=>(edge.to||edge.target)===owner.id).map(edge=>edge.from||edge.source));
    const absolute=value=>{try{return new URL(value,location.href).href;}catch{return value;}};
    for(const source of nodes){
        if(playback&&source!==owner&&!incoming.has(source.id))continue;
        for(const item of source.images||[]){
            const raw=item.url,current=displayMediaUrl(item);if(!raw||!current)continue;
            const target=playback?current:raw;
            for(const value of [raw,current,absolute(raw),absolute(current)])aliases.set(value,target);
        }
    }
    const copy=JSON.parse(JSON.stringify(document));
    const visit=value=>{
        if(!value||typeof value!=='object')return;
        if(typeof value.url==='string'&&aliases.has(value.url))value.url=aliases.get(value.url);
        Object.values(value).forEach(visit);
    };
    visit(copy);return copy;
}

async function uploadSmartStudioMedia(node){
    if(isSmartCanvasLocked()) return;
    const input=document.createElement('input');input.type='file';
    input.accept=node.type==='smart-model'?'.glb,.gltf':'audio/*';
    input.onchange=async()=>{
        if(!input.files.length || isSmartCanvasLocked())return;
        const origin=canvas, owner=node;
        try{
            const result=await uploadFiles(input.files);
            if(canvas!==origin || !nodes.includes(owner) || isSmartCanvasLocked())return;
            if(!result.length)throw new Error('当前上传接口未接受该素材格式');
            pushUndo();owner.images=owner.type==='smart-model'?result.map(item=>({...item,kind:'model'})):result;render();scheduleSave();
        }catch(error){toast(error.message);}
    };
    input.click();
}

let smartStudioSession=null;
let pixmaxSnapToGrid=false;
let pixmaxSpacePanning=false;
let pixmaxCanvasMode='normal';
let pixmaxPasteWithLinks=false;
document.querySelectorAll('#createMenu .create-card').forEach(button=>{
    const kind={prompt:'text','generate-image':'image','generate-video':'video'}[button.dataset.createType] || button.dataset.createType;
    button.querySelector('.create-card-icon').innerHTML=pixmaxSvg('menu-'+kind);
});
for(const [selector,kinds] of [
    ['.pixmax-topbar>button',['cloud','external','share','bell']],
    ['.pixmax-rail>button',['add','upload','assets','history','more']],
    ['.pixmax-bottom-controls .pixmax-control-group:first-child>button',['pointer','map','magnet','fit','minus','plus']],
    ['.pixmax-bottom-controls .pixmax-control-group:last-child>button',['undo','redo']]
])document.querySelectorAll(selector).forEach((button,index)=>{
    const icon=button.querySelector('i,svg'),svg=pixmaxSvg('tool-'+kinds[index]);if(icon&&svg)icon.outerHTML=svg;
});
function openPixmaxNodeMenu(event){
    closeSmartCanvasContext();const bounds=event.currentTarget.getBoundingClientRect();
    openCreateMenu({clientX:bounds.right+16,clientY:bounds.top});
    createMenuPoint=screenToWorld({clientX:innerWidth/2-200,clientY:innerHeight/2-100});
}
function zoomPixmaxCanvas(factor){
    const bounds=smartViewportBounds(),cx=bounds.x+bounds.width/2,cy=bounds.y+bounds.height/2;
    const x=(cx-viewport.x)/viewport.scale,y=(cy-viewport.y)/viewport.scale;
    viewport.scale=Math.min(2,Math.max(.1,safeScale(viewport.scale*factor)));viewport.x=cx-x*viewport.scale;viewport.y=cy-y*viewport.scale;
    applyViewport();scheduleSave();
}
function setPixmaxCanvasTool(tool){
    pixmaxCanvasMode=tool==='select'?'normal':tool==='pan'?'gripper':pixmaxCanvasMode==='preview'?'normal':'preview';
    shell.dataset.tool=pixmaxCanvasMode==='normal'?'select':'pan';
    shell.dataset.canvasMode=pixmaxCanvasMode;
    const button=document.querySelector('[data-pixmax-mode]');
    if(button){button.classList.add('active');button.setAttribute('aria-pressed',String(pixmaxCanvasMode!=='normal'));button.title=pixmaxCanvasMode==='preview'?'预览模式':'选择模式';button.innerHTML=pixmaxSvg(pixmaxCanvasMode==='normal'?'tool-pointer':'tool-preview');}
}
function tidyPixmaxCanvas(){
    if(isSmartCanvasLocked())return;
    const roots=nodes.filter(node=>!node.parentId&&!isHistoryGroupNode(node));if(!roots.length)return;
    const sizes=roots.map(node=>({id:node.id,...nodeRect(node)}));
    const edges=(canvas.connections||[]).map(edge=>({source:edge.from,target:edge.to}));
    const positions=window.PixmaxCanvasLayout.flow(sizes,edges,{direction:'LR'});
    const dx=Math.min(...roots.map(n=>n.x))-Math.min(...[...positions.values()].map(p=>p.x));
    const dy=Math.min(...roots.map(n=>n.y))-Math.min(...[...positions.values()].map(p=>p.y));
    pushUndo();roots.forEach(node=>{const p=positions.get(node.id);node.x=p.x+dx;node.y=p.y+dy;});render();scheduleSave();
}
async function copyPixmaxCanvasLink(){
    try{await navigator.clipboard.writeText(location.href);toast('已复制画布链接');}catch{toast('浏览器未允许复制，请复制地址栏中的画布链接');}
}
async function openSmartStudio(id){
    const node=nodes.find(node=>node.id===id);
    if(node?.pixmaxSourceType==='BASE_3D')return window.PixmaxModelPreview.open(node);
    if(!node || isSmartCanvasLocked()) return;
    if(node.type==='smart-audio')return window.PixmaxAudioCreation.open(node);
    if(node.type==='smart-model')return window.PixmaxModelCreation.open(node);
    if(node.type==='smart-storyboard')return openSmartStoryboard(node);
    if(smartStudioSession)await closeSmartStudio();
    const overlay=document.createElement('div');overlay.className='pixmax-editor-overlay';
    const iframe=document.createElement('iframe');iframe.title=smartStudioTitle(node);
    const channel=typeof crypto.randomUUID==='function'?crypto.randomUUID():uid('editor');iframe.src='/static/pixmax-editor.html?channel='+encodeURIComponent(channel);
    overlay.appendChild(iframe);document.body.appendChild(overlay);
    const originCanvas=canvas, leaseEpoch=window.MemberCanvasEdit?.active?.lease?.epoch;
    const kind=node.type==='smart-editor'?'editor':'director';
    const resources=smartStudioResources(node);
    if(node.type==='smart-model')resources.push(...node.images.map((item,index)=>({id:id+':'+index,name:item.name,kind:'model',url:displayMediaUrl(item)})));
    smartStudioSession={overlay,iframe,node,channel,originCanvas,leaseEpoch,kind,closing:false};
    const valid=()=>smartStudioSession?.iframe===iframe && canvas===originCanvas && nodes.includes(node) && !isSmartCanvasLocked() && window.MemberCanvasEdit?.active?.lease?.epoch===leaseEpoch;
    const send=(type,payload={})=>iframe.contentWindow?.postMessage({pixmaxEditor:true,channel,type,...payload},location.origin);
    const listener=async event=>{
        const data=event.data;
        if(event.source!==iframe.contentWindow || event.origin!==location.origin || !data?.pixmaxEditor || data.channel!==channel)return;
        if(data.type==='closed'){overlay.remove();window.removeEventListener('message',listener);if(smartStudioSession?.iframe===iframe)smartStudioSession=null;return;}
        if(!valid()){send('close');return;}
        if(data.type==='ready')send('init',{kind,resources,allResources:smartStudioResources(node,true),document:pixmaxStudioDocumentUrls(node.studioDocument,node,true)});
        if(data.type==='document'){
            const saved=pixmaxStudioDocumentUrls(data.document,node,false);
            if(JSON.stringify(node.studioDocument)!==JSON.stringify(saved)){pushUndo();node.studioDocument=saved;scheduleSave();}
        }
        if(data.type==='exit')closeSmartStudio();
        if(data.type==='toast' || data.type==='error')toast(data.text);
        if(data.type==='list-sources')send('reply',{requestId:data.requestId,result:{allResources:smartStudioResources(node,true),resources:smartStudioResources(node)}});
        if(data.type==='sources'){
            pushUndo();
            for(const resourceId of data.resourceIds || []){
                const sourceId=resourceId.slice(0,resourceId.lastIndexOf(':'));
                if(nodes.some(source=>source.id===sourceId))connectInputNode(sourceId,node.id);
            }
            scheduleSave();send('reply',{requestId:data.requestId,result:true});
        }
        if(data.type==='remove-source'){
            const sourceId=data.resourceId.slice(0,data.resourceId.lastIndexOf(':'));
            pushUndo();canvas.connections=(canvas.connections||[]).filter(edge=>!(edge.from===sourceId&&edge.to===node.id));
            node.inputNodeIds=(node.inputNodeIds||[]).filter(id=>id!==sourceId);
            render();scheduleSave();send('reply',{requestId:data.requestId,result:true});
        }
        if(data.type==='export' || data.type==='upload'){
            try{
                const uploaded=await uploadFiles(data.files);
                if(!valid())throw new Error('画布或编辑资格已变化');
                if(uploaded.length!==data.files.length)throw new Error('部分素材上传失败');
                if(data.type==='export'){
                    pushUndo();
                    if(kind==='editor'||mediaKindForItem(uploaded[0])==='image'){
                        node.studioPreview=uploaded[0];
                        const bounds=imageLayout([uploaded[0]],1,{type:'smart-image',generationKind:mediaKindForItem(uploaded[0])});
                        node.w=bounds.width;node.h=bounds.height;
                    }
                    const result=createNode(node.x+Number(node.w || 320)+80,node.y,uploaded,{skipUndo:true,select:false});
                    connectInputNode(node.id,result.id);render();scheduleSave();toast('已导出到画布');
                    send('reply',{requestId:data.requestId,result:uploaded.map((item,index)=>({id:result.id+':'+index,name:item.name,kind:mediaKindForItem(item),url:displayMediaUrl(item)}))});
                }else{
                    pushUndo();
                    const resources=uploaded.map((item,index)=>{
                        const source=createNode(node.x-400,node.y+index*240,[item],{skipUndo:true,select:false});
                        connectInputNode(source.id,node.id);
                        return {id:source.id+':0',name:item.name,kind:mediaKindForItem(item),url:displayMediaUrl(item),previewUrl:pixmaxMediaPoster(item)};
                    });
                    render();scheduleSave();send('reply',{requestId:data.requestId,result:resources});
                }
            }catch(error){send('reply',{requestId:data.requestId,error:error.message});toast(error.message);}
        }
    };
    window.addEventListener('message',listener);
    smartStudioSession.listener=listener;
    // Reopening loads persisted media as well as currently connected sources.
    resources.push(...(node.images || []).filter(item=>kind==='editor').map((item,index)=>({id:id+':saved:'+index,name:item.name,kind:mediaKindForItem(item),url:displayMediaUrl(item)})));
}

function closeSmartStudio(){
    const session=smartStudioSession;
    if(!session)return;
    if(session.closing)return session.closePromise;
    session.closing=true;
    session.iframe.contentWindow?.postMessage({pixmaxEditor:true,channel:session.channel,type:'close'},location.origin);
    // The child saves its latest document while unmounting, then acknowledges closed.
    session.closePromise=new Promise(resolve=>{
        const finish=()=>{if(!session.overlay.isConnected){clearInterval(timer);clearTimeout(fallback);resolve();}};
        const timer=setInterval(finish,50);
        const fallback=setTimeout(()=>{session.overlay.remove();window.removeEventListener('message',session.listener);if(smartStudioSession===session)smartStudioSession=null;clearInterval(timer);resolve();},3000);
    });
    return session.closePromise;
}

function openSmartStoryboard(node){
    const origin=canvas,epoch=window.MemberCanvasEdit?.active?.lease?.epoch;
    const modal=document.createElement('div');modal.className='pixmax-storyboard-modal';
    modal.innerHTML=`<section><header><strong>分镜脚本</strong><button type="button" data-story-close aria-label="关闭分镜脚本">×</button></header><nav class="pixmax-story-tabs"><button type="button" data-story-step="0" class="active">1 确认镜头</button><button type="button" data-story-step="1">2 准备资产</button><button type="button" data-story-step="2">3 生成提示词</button></nav><div class="pixmax-story-body"></div><footer><button type="button" data-story-add>添加镜头</button><button type="button" data-story-export>插入画布</button><button type="button" data-story-save>保存并关闭</button></footer></section>`;
    modal.setAttribute('role','dialog');modal.setAttribute('aria-label','分镜脚本');
    modal.querySelector('.pixmax-story-tabs').insertAdjacentHTML('afterend',`<div class="pixmax-story-source"><label>故事 / 剧本<textarea data-story-script aria-label="分镜故事剧本" placeholder="输入故事、剧本或创意，自动拆解为镜头">${escapeHtml(node.storyboardConfig?.script||pixmaxTextContext(node).text||'')}</textarea></label><div class="pixmax-creation-models">${pixmaxTextModelControls(node.storyboardConfig)}</div><div class="pixmax-story-ai-actions"><label>镜头数量<input type="number" data-story-count aria-label="分镜镜头数量" min="1" max="100" value="${Number(node.storyboardConfig?.count)||node.shots?.length||6}"></label><label>风格<input data-story-style aria-label="分镜视觉风格" placeholder="电影、动画、广告…" value="${escapeAttr(node.storyboardConfig?.style||'电影感')}"></label><button type="button" data-story-generate>自动拆分镜头</button><p role="status"></p></div></div>`);
    document.body.appendChild(modal);bindPixmaxTextModels(modal);
    if(node.videoAnalysis)modal.querySelector('.pixmax-story-ai-actions').insertAdjacentHTML('beforeend','<button type="button" data-story-video-parse>视频解析参数</button>');
    modal.addEventListener('keydown',event=>{event.stopPropagation();if(event.key==='Escape')modal.querySelector('[data-story-close]').click();});
    const shots=JSON.parse(JSON.stringify(node.shots || []));
    const assets=JSON.parse(JSON.stringify(node.storyboardAssets || []));
    if(!shots.length)shots.push({duration:5,description:'',size:'全景',lighting:'',dialogue:'',sound:'',movement:'固定',asset:'',prompt:''});
    const fields=[['duration','时长(s)'],['description','画面描述'],['size','景别'],['cameraAngle','相机角度'],['lighting','光影氛围'],['dialogue','对白 / 旁白'],['sound','音效'],['movement','运镜']];
    let step=0;
    const valid=()=>modal.isConnected&&canvas===origin&&nodes.includes(node)&&!isSmartCanvasLocked()&&window.MemberCanvasEdit?.active?.lease?.epoch===epoch;
    const draw=()=>{
        const columns=step===0?fields:step===1?[['description','画面描述'],['asset','素材 / 角色备注']]:[['prompt','生成提示词'],['videoPrompt','视频运动提示词']];
        modal.querySelector('.pixmax-story-body').innerHTML=`<table><thead><tr><th>镜号</th>${columns.map(field=>`<th>${field[1]}</th>`).join('')}<th></th></tr></thead><tbody>${shots.map((shot,index)=>`<tr><td>${index+1}</td>${columns.map(([key,label])=>`<td><textarea aria-label="镜头 ${index+1} ${label}" data-shot="${index}" data-field="${key}">${escapeHtml(String(shot[key] || ''))}</textarea></td>`).join('')}<td><button type="button" data-story-delete="${index}" aria-label="删除镜头 ${index+1}">×</button></td></tr>`).join('')}</tbody></table>`;
        if(step===1&&assets.length)modal.querySelector('.pixmax-story-body').insertAdjacentHTML('beforeend',`<section aria-label="分镜资产清单"><h3>人物、场景、道具清单</h3><button type="button" data-story-asset-images>生成资产图像</button><table><thead><tr><th>类型</th><th>名称</th><th>外观与特征</th><th>资产提示词</th><th>生成图像</th></tr></thead><tbody>${assets.map((asset,index)=>{const media=window.PixmaxStoryboardAssets?.references(node,asset)||[];return `<tr><td>${{character:'人物',scene:'场景',prop:'道具'}[asset.type]||escapeHtml(asset.type)}</td>${[['name','名称'],['description','外观描述'],['prompt','提示词']].map(([key,label])=>`<td><textarea aria-label="资产 ${index+1} ${label}" data-asset-index="${index}" data-asset-field="${key}">${escapeHtml(asset[key]||'')}</textarea></td>`).join('')}<td>${media.length?`<img class="pixmax-story-asset-thumb" src="${escapeAttr(smartMediaPreviewUrl(media.at(-1),192))}" alt="${escapeAttr(asset.name)} 生成图像">`:''}<button type="button" data-story-asset-images="${escapeAttr(asset.id)}">${media.length?'重新生成':'生成图像'}</button></td></tr>`;}).join('')}</tbody></table></section>`);
        if(step===2)modal.querySelector('.pixmax-story-body').insertAdjacentHTML('afterbegin',`<div class="pixmax-story-media-actions"><label>提示词类型<select data-story-prompt-kind aria-label="镜头提示词类型">${[['image','镜头图像'],['video','视频运动'],['both','图像与视频']].map(([value,label])=>`<option value="${value}" ${value===(node.storyboardConfig?.promptKind||'image')?'selected':''}>${label}</option>`).join('')}</select></label><button type="button" data-story-media="image">生成镜头图像</button><button type="button" data-story-media="video">生成镜头视频</button></div>`);
    };
    draw();
    modal.addEventListener('input',event=>{const field=event.target.dataset.field;if(field){const shot=shots[Number(event.target.dataset.shot)];shot[field]=field==='duration'?Math.max(.1,Number(event.target.value)||5):event.target.value;if(['prompt','videoPrompt'].includes(field)){shot.promptStatus='completed';delete shot.promptError;}}});
    modal.addEventListener('input',event=>{const field=event.target.dataset.assetField;if(field)assets[Number(event.target.dataset.assetIndex)][field]=event.target.value;});
    const save=()=>{if(!valid())return false;pushUndo();node.shots=shots;if(node.storyboardAssets||assets.length)node.storyboardAssets=assets;render();scheduleSave();return true;};
    modal.addEventListener('click',async event=>{
        const button=event.target.closest('button');if(!button)return;
        if(button.hasAttribute('data-story-close')){save();modal.remove();return;}
        if(!valid()){modal.remove();return;}
        if(button.hasAttribute('data-story-video-parse')){if(save()){modal.remove();window.PixmaxVideoParse.open(node);}return;}
        if(button.hasAttribute('data-story-asset-images')){if(save()){modal.remove();window.PixmaxStoryboardAssets.open(node,button.dataset.storyAssetImages||undefined);}return;}
        if(button.hasAttribute('data-story-media')){if(save()){modal.remove();window.PixmaxStoryboardMedia.open(node,button.dataset.storyMedia);}return;}
        if(button.hasAttribute('data-story-generate')){
            const status=modal.querySelector('[role=status]');
            try{
                const config={...pixmaxTextModelValue(modal),script:modal.querySelector('[data-story-script]').value,style:modal.querySelector('[data-story-style]').value,count:Number(modal.querySelector('[data-story-count]').value),promptKind:modal.querySelector('[data-story-prompt-kind]')?.value||'image'};
                if(!Number.isInteger(config.count)||config.count<1||config.count>100)throw new Error('镜头数量必须为 1 到 100');
                if(step===0&&!config.script.trim())throw new Error('请先填写故事或剧本');
                const stage=step,before=JSON.stringify(shots),assetsBefore=JSON.stringify(assets),input=config.script,style=config.style;
                pushUndo();node.shots=JSON.parse(before);if(node.storyboardAssets||assets.length)node.storyboardAssets=JSON.parse(assetsBefore);node.storyboardConfig=config;scheduleSave();
                const promptFields=config.promptKind==='both'?['prompt','videoPrompt']:[config.promptKind==='video'?'videoPrompt':'prompt'];
                const instruction=stage===0?`将剧本拆分为 ${config.count} 个镜头，每个镜头包含完整分镜字段。`:stage===1?'保持镜头数量和画面内容不变，为每个镜头规划人物、场景和道具，在 asset 字段写出资产准备说明。':`保持镜头数量和画面内容不变，为每个镜头编写 ${promptFields.join(' 和 ')} 字段。prompt 是静态图像构图；videoPrompt 是时序动作、运镜和声音。引用资产时使用 <资产名称@资产id>，保留提供的 id，不要编造资产。`;
                const request={...config,message:[instruction,'视觉风格：'+style,stage===0?input:assets.length?JSON.stringify({shots,assets}):JSON.stringify(shots)].join('\n'),systemPrompt:'你是专业分镜导演。仅返回 JSON，格式为 {"shots":[{"duration":5,"description":"画面","size":"景别","lighting":"光影","dialogue":"对白或旁白","sound":"音效","movement":"运镜","asset":"人物场景道具说明","prompt":"图像提示词","videoPrompt":"视频运动提示词"}]}。duration 使用秒，镜头时长大于 0，不要返回 Markdown 或说明文字。'};
                button.disabled=true;status.textContent='正在生成，请稍候…';
                await runPixmaxTextTask(node,request,result=>{
                    if(stage!==0)result=result.map((shot,index)=>({...shots[index],...Object.fromEntries((stage===1?['asset']:promptFields).map(field=>[field,shot[field]])),...(stage===2?{promptStatus:'completed',promptError:undefined}:{})}));
                    node.shots=result;shots.splice(0,shots.length,...JSON.parse(JSON.stringify(result)));
                },()=>valid()&&pixmaxTextModelUnchanged(modal,config)&&Number(modal.querySelector('[data-story-count]').value)===config.count&&step===stage&&JSON.stringify(shots)===before&&JSON.stringify(assets)===assetsBefore&&(stage!==2||modal.querySelector('[data-story-prompt-kind]').value===config.promptKind)&&modal.querySelector('[data-story-script]').value===input&&modal.querySelector('[data-story-style]').value===style,
                text=>{const result=pixmaxStructuredShots(text);if(result.length!==(stage===0?config.count:shots.length))throw new Error('模型返回的镜头数量不一致，原镜头已保留');if(stage!==0&&result.some(shot=>(stage===1?['asset']:promptFields).some(field=>!shot[field].trim())))throw new Error('模型回复缺少'+(stage===1?'资产说明':'提示词'));return result;});
                draw();status.textContent=stage===0?'镜头已生成，可继续准备资产':stage===1?'资产说明已生成':'提示词已生成，可以插入画布';
            }catch(error){status.textContent=error.message||'分镜生成失败';}
            finally{button.disabled=false;}
            return;
        }
        if(button.hasAttribute('data-story-step')){
            step=Number(button.dataset.storyStep);
            if(step===2&&!node.pixmaxStoryboardSource)shots.forEach(shot=>{if(!shot.prompt)shot.prompt=[shot.description,shot.size,shot.lighting,shot.movement,shot.asset].filter(Boolean).join('，');});
            modal.querySelectorAll('[data-story-step]').forEach(tab=>tab.classList.toggle('active',Number(tab.dataset.storyStep)===step));draw();
            modal.querySelector('[data-story-generate]').textContent=['自动拆分镜头','生成资产说明','生成镜头提示词'][step];
        }
        if(button.hasAttribute('data-story-add')){shots.push({duration:5,description:'',size:'全景',movement:'固定'});draw();}
        if(button.hasAttribute('data-story-delete')){shots.splice(Number(button.dataset.storyDelete),1);draw();}
        if(button.hasAttribute('data-story-save')){save();modal.remove();}
        if(button.hasAttribute('data-story-export')){
            if(!save())return;
            shots.forEach((shot,index)=>{const result=createPromptNode(node.x+400+index*360,node.y,{skipUndo:true,select:false});result.text=shot.prompt || [shot.description,shot.size,shot.lighting,shot.movement,shot.asset].filter(Boolean).join('，');connectInputNode(node.id,result.id);window.PixmaxStoryboardAssets?.linkShot(node,shot,result);});
            render();scheduleSave();modal.remove();
        }
    });
}

function openSmartCanvasContext(event,node){
    if(isSmartCanvasLocked())return;
    closeSmartCanvasContext();closeCreateMenu();
    createMenuPoint=screenToWorld(event);
    const menu=document.createElement('div');menu.className='pixmax-context-menu create-menu-context';menu.setAttribute('role','menu');
    const media=node?.images?.[0]||node?.studioPreview;
    menu.innerHTML=node?`${media?.url?'<button data-context-action="asset">保存到资产库</button>':''}<button data-context-action="pin">${(window.PixmaxTags?.ids(node).length??node.pinned)?'取消 pin':'pin 到汇总'}</button><button data-context-action="copy">复制 <kbd>Ctrl C</kbd></button>${media?.url?'<button data-context-action="cover">设为项目封面</button>':''}<button data-context-action="delete">删除 <kbd>Delete</kbd></button>`:'<button data-context-action="upload">上传</button><button data-context-action="add">添加节点</button><hr><button data-context-action="undo">撤销 <kbd>Ctrl Z</kbd></button><button data-context-action="redo">重做 <kbd>Ctrl Shift Z</kbd></button><hr><button data-context-action="paste">粘贴 <kbd>Ctrl V</kbd></button><button data-context-action="paste-links">粘贴（保留连线） <kbd>Ctrl Shift V</kbd></button>';
    if(node){const ids=isNodeSelected(node.id)?selectedNodeIds():[node.id];if(window.PixmaxCanvasFrames?.isFrame(node))menu.querySelector('[data-context-action="pin"]')?.remove();if(window.PixmaxCanvasFrames?.expand(ids).filter(id=>!window.PixmaxCanvasFrames.isFrame(nodes.find(node=>node.id===id))).length>1)menu.insertAdjacentHTML('beforeend','<button data-context-action="group">分组 <kbd>Ctrl G</kbd></button>');if(window.PixmaxCanvasFrames?.isFrame(node)||node.frameId)menu.insertAdjacentHTML('beforeend','<button data-context-action="ungroup">取消分组 <kbd>Ctrl Shift G</kbd></button>');}
    shell.appendChild(menu);
    menu.style.left=Math.max(8,Math.min(event.clientX,innerWidth-menu.offsetWidth-8))+'px';menu.style.top=Math.max(8,Math.min(event.clientY,innerHeight-menu.offsetHeight-8))+'px';
    menu.addEventListener('mousedown',event=>event.stopPropagation());
    menu.addEventListener('wheel',event=>event.stopPropagation(),{passive:true});
    const add=menu.querySelector('[data-context-action="add"]');
    add?.addEventListener('mouseenter',()=>{const bounds=menu.getBoundingClientRect();openCreateMenu({clientX:bounds.right+8,clientY:bounds.top});createMenuPoint=screenToWorld(event);});
    menu.addEventListener('click',action=>{
        action.stopPropagation();const kind=action.target.closest('[data-context-action]')?.dataset.contextAction;
        if(kind==='add'){const bounds=menu.getBoundingClientRect();openCreateMenu({clientX:bounds.right,clientY:bounds.top});createMenuPoint=screenToWorld(event);return;}
        closeSmartCanvasContext();
        if(kind==='upload')document.getElementById('fileInput').click();
        if(kind==='copy'){if(!isNodeSelected(node.id))smartSelection.createdNode(node.id);copySelectedNodes();}
        if(kind==='pin')window.PixmaxTags.togglePin(node);
        if(kind==='delete')deleteSmartNodes(isNodeSelected(node.id)?selectedNodeIds():[node.id]);
        if(kind==='group')window.PixmaxCanvasFrames?.create(isNodeSelected(node.id)?selectedNodeIds():[node.id]);
        if(kind==='ungroup')window.PixmaxCanvasFrames?.ungroup(isNodeSelected(node.id)?selectedNodeIds():[node.id]);
        if(kind==='asset'){if(node.images?.[0])saveSmartImageToAssetLibrary(node.id,0);else addUrlToAssetLibrary(media.url,media.name||node.label||smartStudioTitle(node));}
        if(kind==='cover'){pushUndo();canvas.cover={...(canvas.cover||{}),node_id:node.id,index:0};scheduleSave();toast('已设为项目封面');}
        if(kind==='undo')performUndo();
        if(kind==='redo')redoSmartCanvas();
        if(kind==='paste'||kind==='paste-links')pasteNodes({includeConnections:kind==='paste-links'});
    });
}
function closeSmartCanvasContext(){document.querySelector('.pixmax-context-menu')?.remove();}
document.addEventListener('pointerdown',event=>{if(!event.target.closest('.pixmax-context-menu,.create-menu'))closeSmartCanvasContext();});
document.addEventListener('keydown',event=>{if(event.key==='Escape'){closeSmartCanvasContext();if(smartStudioSession)closeSmartStudio();}});

function redoSmartCanvas(){
    if(isSmartCanvasLocked() || !smartRedoStack.length)return;
    undoStack.push(snapshotForUndo());
    const snapshot=smartRedoStack.pop();nodes=snapshot.nodes;canvas.nodes=nodes;canvas.connections=snapshot.connections;
    if(snapshot.nodeTags)canvas.node_tags=snapshot.nodeTags;
    smartSelection.restoreDocument(snapshot);smartComposer.documentReplaced();render();scheduleSave();
}
