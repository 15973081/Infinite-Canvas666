/* Pixmax's canvas/node sidebar uses the existing directory and document owners. */
(() => {
    'use strict';
    let panel,toggleButton,list,menu,frame=null,requestVersion=0,scope='',tab='canvas',query='',type='',folder='',opened=true;
    let records=[],folders=[],collapsed=new Set(),signature='',loading=false,disposed=false;
    const labels={text:'文本生成节点',image:'图像节点',video:'视频节点',audio:'音频生成节点',model:'3D模型生成节点',storyboard:'分镜脚本',director:'导演台',editor:'剪辑台',frame:'分组'};
    const icons={text:'text-cursor-input',image:'image',video:'clapperboard',audio:'music',model:'box',storyboard:'layout-grid',director:'clapperboard',editor:'monitor-play',frame:'group'};
    const normalized=value=>String(value||'').normalize('NFKC').toLocaleLowerCase('zh-CN');
    const currentScope=()=>window.CanvasSession?.enabled ? window.CanvasSession.context?.member?.id+':'+window.CanvasSession.context?.workspace?.id : 'local';
    const documentInScope=()=>!window.CanvasSession?.enabled||window.MemberCanvasEdit?.active?.workspaceId===window.CanvasSession.context?.workspace?.id;
    const storageKey=()=>window.CanvasSession?.storageKey?.('pixmax_navigator_v1')||'pixmax_navigator_v1';
    function can(permission){
        const session=window.CanvasSession;
        return session?.enabled ? !session.paused&&['normal','scheduled'].includes(session.maintenance?.mode||'normal')&&Boolean(session.context?.workspace?.permissions?.includes(permission)) : !isSmartCanvasLocked();
    }
    function ensureScope(expected){if(disposed||expected!==currentScope())throw new Error('工作空间已变化，请重新打开目录');}
    function savePreferences(){try{localStorage.setItem(storageKey(),JSON.stringify({opened,tab,folder,collapsed:[...collapsed]}));}catch(_){}}
    function readPreferences(){
        let saved={};try{saved=JSON.parse(localStorage.getItem(storageKey())||'{}')||{};}catch(_){}
        opened=saved.opened!==false;tab=saved.tab==='nodes'?'nodes':'canvas';folder=String(saved.folder||'');
        collapsed=new Set(Array.isArray(saved.collapsed)?saved.collapsed:[]);query='';type='';
    }
    function status(value){if(panel)panel.querySelector('[role=status]').textContent=value||'';}
    function setOpened(value){
        opened=Boolean(value);panel.hidden=!opened;document.body.classList.toggle('pixmax-navigator-open',opened);
        toggleButton.setAttribute('aria-expanded',String(opened));toggleButton.title=opened?'关闭画布目录':'打开画布目录';
        if(!opened)closeMenu();else documentChanged();savePreferences();
    }
    function nodeKind(node){
        if(node.type==='smart-frame')return 'frame';
        if(node.type==='smart-prompt')return 'text';
        if(isSmartStudioNode(node))return node.type.slice(6);
        return node.generationKind||mediaKindForItem(node.images?.[0]||{})||'image';
    }
    function nodeLabel(node){
        return node.label||node.title||(!node.generationKind&&node.images?.[0]?.name?node.images[0].name.replace(/\.[^.]+$/,''):labels[nodeKind(node)])||'节点';
    }
    function nodeRows(){
        if(!documentInScope())return '<p class="pixmax-directory-empty">请从目录打开画布</p>';
        const search=normalized(query),rows=nodes.filter(node=>(!type||nodeKind(node)===type)&&(!search||normalized(nodeLabel(node)+' '+(node.text||node.promptDraftText||'')).includes(search)));
        const selected=new Set([smartSelection.nodeId,...smartSelection.ids]);
        return rows.map(node=>{
            const kind=nodeKind(node),media=node.images?.[0]||node.studioPreview;
            const poster=media&&(mediaKindForItem(media)==='image'?smartMediaPreviewUrl(media,256):pixmaxMediaPoster(media));
            return `<div class="pixmax-directory-row ${selected.has(node.id)?'active':''}" data-node-row="${escapeAttr(node.id)}"><button type="button" class="pixmax-directory-main" data-node-focus="${escapeAttr(node.id)}" aria-label="定位节点 ${escapeAttr(nodeLabel(node))}">${poster?`<img src="${escapeAttr(poster)}" loading="lazy" alt="">`:`<i data-lucide="${icons[kind]||'box'}"></i>`}<span>${escapeHtml(nodeLabel(node))}</span>${(window.PixmaxTags?.ids(node).length??node.pinned)?'<i data-lucide="pin" class="pixmax-directory-pin"></i>':''}</button><button type="button" class="pixmax-directory-more" data-node-menu="${escapeAttr(node.id)}" aria-label="节点操作 ${escapeAttr(nodeLabel(node))}">⋯</button></div>`;
        }).join('')||'<p class="pixmax-directory-empty">'+(search||type?'没有匹配的节点':'添加节点，开始创作')+'</p>';
    }
    function canvasRows(){
        const search=normalized(query),seen=new Set();
        const model=window.CanvasDirectoryModel.build({canvases:records,deletedCanvases:[],folders,trashMode:false,folderId:'all',query:''});
        const grouped=new Map();
        for(const item of records){const key=item.folder_id||'';if(!grouped.has(key))grouped.set(key,[]);grouped.get(key).push(item);}
        for(const group of grouped.values())group.sort((a,b)=>window.CanvasDirectoryModel.compareRecords(a,b,'updated'));
        const row=(item,depth)=>`<div class="pixmax-directory-row ${item.id===canvas?.id?'active':''}" draggable="true" data-canvas-row="${escapeAttr(item.id)}" style="--directory-depth:${Math.min(depth,8)}"><a class="pixmax-directory-main" data-canvas-open="${escapeAttr(item.id)}" href="${escapeAttr(window.CanvasNavigation.canvasUrl(item.id))}" target="_top" ${item.id===canvas?.id?'aria-current="page"':''}><i data-lucide="${item.kind==='smart'?'scan':'layout-grid'}"></i><span>${escapeHtml(item.title||'未命名画布')}</span></a><button type="button" class="pixmax-directory-more" data-canvas-menu="${escapeAttr(item.id)}" aria-label="画布操作 ${escapeAttr(item.title||'未命名画布')}">⋯</button></div>`;
        const items=(id,depth,all)=>(grouped.get(id)||[]).filter(item=>all||!search||normalized(item.title).includes(search)).map(item=>row(item,depth)).join('');
        function branch(item,depth,inherited=false){
            if(seen.has(item.id))return '';seen.add(item.id);
            const matches=inherited||Boolean(search&&normalized(item.name).includes(search));
            const contents=items(item.id,depth+1,matches)+model.children(item.id).map(child=>branch(child,depth+1,matches)).join('');
            if(search&&!matches&&!contents)return '';
            const expanded=Boolean(search)||!collapsed.has(item.id);
            return `<section class="pixmax-directory-folder" data-folder-drop="${escapeAttr(item.id)}"><div class="pixmax-directory-row ${folder===item.id?'chosen':''}" style="--directory-depth:${Math.min(depth,8)}"><button type="button" class="pixmax-directory-main" data-folder-toggle="${escapeAttr(item.id)}" aria-label="文件夹 ${escapeAttr(item.name)}" aria-expanded="${expanded}"><i data-lucide="${expanded?'chevron-down':'chevron-right'}"></i><i data-lucide="folder"></i><span>${escapeHtml(item.name)}</span></button><button type="button" class="pixmax-directory-more" data-folder-menu="${escapeAttr(item.id)}" aria-label="文件夹操作 ${escapeAttr(item.name)}">⋯</button></div>${expanded?contents:''}</section>`;
        }
        let html=items('',0,false)+model.children('').map(item=>branch(item,0)).join('');
        // Malformed/orphaned folder records must neither recurse forever nor hide content.
        folders.forEach(item=>{if(!seen.has(item.id))html+=branch(item,0);});
        const known=new Set(folders.map(item=>item.id));
        records.filter(item=>item.folder_id&&!known.has(item.folder_id)&&(!search||normalized(item.title).includes(search))).forEach(item=>html+=row(item,0));
        return html||`<p class="pixmax-directory-empty">${loading?'正在加载画布…':search?'没有匹配的画布或文件夹':'新建画布，开始创作'}</p>`;
    }
    function draw(){
        if(!panel||disposed)return;
        if(scope!==currentScope()){
            records=[];folders=[];signature='';list.replaceChildren();closeMenu();void refresh();return;
        }
        panel.querySelector('[data-directory-title]').textContent=documentInScope()?canvas?.title||'智能画布':window.CanvasSession.context?.workspace?.name||'画布';
        panel.querySelector('[data-directory-create-canvas]').disabled=!can('canvas.create');
        panel.querySelector('[data-directory-create-folder]').disabled=!can('canvas.edit');
        panel.querySelector('[data-directory-creations]').hidden=tab!=='canvas';
        panel.querySelector('[data-directory-type]').hidden=tab!=='nodes';
        panel.querySelector('[data-directory-search]').placeholder=tab==='nodes'?'搜索节点名称或内容':'搜索画布或文件夹';
        for(const button of panel.querySelectorAll('[data-directory-tab]')){button.setAttribute('aria-selected',String(button.dataset.directoryTab===tab));button.tabIndex=button.dataset.directoryTab===tab?0:-1;}
        if(!opened)return;
        const current=documentInScope()&&records.find(item=>item.id===canvas?.id);if(current)current.title=canvas.title;
        const html=tab==='nodes'?nodeRows():canvasRows();
        if(html!==signature){
            const scroll=list.scrollTop,active=document.activeElement;
            const key=list.contains(active)&&['data-node-focus','data-node-menu','data-canvas-open','data-canvas-menu','data-folder-toggle','data-folder-menu'].find(name=>active.hasAttribute(name));
            const value=key&&active.getAttribute(key);
            list.innerHTML=html;signature=html;list.scrollTop=scroll;window.lucide?.createIcons({root:list});
            if(key)list.querySelector(`[${key}="${CSS.escape(value)}"]`)?.focus({preventScroll:true});
        }
    }
    function documentChanged(){
        if(!panel||disposed||frame!==null)return;
        frame=requestAnimationFrame(()=>{frame=null;draw();});
    }
    async function refresh(){
        if(!panel||disposed)return;
        const version=++requestVersion;loading=true;status('');documentChanged();
        try{
            if(window.CanvasSession)await window.CanvasSession.ready;
            const expected=currentScope();
            if(scope!==expected){scope=expected;records=[];folders=[];signature='';list.replaceChildren();readPreferences();panel.querySelector('[data-directory-search]').value='';panel.querySelector('[data-directory-type]').value='';setOpened(opened);}
            for(;;){
                if(window.CanvasDirectoryApi.busy)await window.CanvasDirectoryApi.flush();
                const epoch=window.CanvasDirectoryApi.epoch;
                const [catalog,directory]=await Promise.all([window.CanvasDirectoryApi.listCanvases(),window.CanvasDirectoryApi.listCanvasFolders()]);
                ensureScope(expected);if(version!==requestVersion)return;
                if(epoch!==window.CanvasDirectoryApi.epoch)continue;
                records=Array.isArray(catalog.canvases)?catalog.canvases:[];folders=Array.isArray(directory.folders)?directory.folders:[];
                if(canvas&&documentInScope()&&!records.some(item=>item.id===canvas.id))records.unshift({id:canvas.id,title:canvas.title,kind:'smart',folder_id:canvas.folder_id||''});
                if(folder&&!folders.some(item=>item.id===folder))folder='';break;
            }
        }catch(error){if(version===requestVersion){records=[];folders=[];status(error.message||'加载目录失败，请重试');}}
        finally{if(version===requestVersion){loading=false;documentChanged();}}
    }
    function viewportBounds(){
        const shellRect=shell.getBoundingClientRect();
        const left=panel&&opened&&innerWidth>700?Math.max(0,Math.min(panel.getBoundingClientRect().right-shellRect.left+16,shell.clientWidth-160)):0;
        return {x:left,y:0,width:shell.clientWidth-left,height:shell.clientHeight};
    }
    function focusNode(node){
        if(!nodes.includes(node)||!documentInScope())return;
        if(innerWidth<=700)setOpened(false);
        const box=nodeRect(node),bounds=viewportBounds(),px=bounds.x+bounds.width/2,py=bounds.y+bounds.height/2;
        viewport.x=px-(box.x+box.width/2)*viewport.scale;viewport.y=py-(box.y+box.height/2)*viewport.scale;
        smartSelection.createdNode(node.id);applyViewport();render();scheduleSave();
    }
    function closeMenu(){menu?.remove();menu=null;}
    function openMenu(anchor,actions){
        const expected=currentScope();
        closeMenu();menu=document.createElement('div');menu.className='pixmax-navigator-menu';menu.setAttribute('role','menu');
        actions.forEach(action=>{
            const button=document.createElement('button');button.type='button';button.textContent=action.label;button.disabled=action.disabled;button.setAttribute('role','menuitem');
            button.onclick=async()=>{closeMenu();try{ensureScope(expected);await action.run();}catch(error){status(error.message);}};menu.appendChild(button);
        });
        document.body.appendChild(menu);const rect=anchor.getBoundingClientRect(),size=menu.getBoundingClientRect();
        menu.style.left=Math.max(8,Math.min(rect.right+4,innerWidth-size.width-8))+'px';menu.style.top=Math.max(8,Math.min(rect.top,innerHeight-size.height-8))+'px';
        menu.addEventListener('keydown',event=>{
            event.stopPropagation();
            if(event.key==='Escape'){closeMenu();anchor.focus();}
            if(['ArrowDown','ArrowUp','Home','End'].includes(event.key)){
                event.preventDefault();const buttons=[...menu.querySelectorAll('button:not(:disabled)')],index=buttons.indexOf(document.activeElement);
                const next=event.key==='Home'?0:event.key==='End'?buttons.length-1:(index+(event.key==='ArrowDown'?1:-1)+buttons.length)%buttons.length;
                buttons[next]?.focus();
            }
        });menu.querySelector('button:not(:disabled)')?.focus();
    }
    function createCanvas(){
        if(!can('canvas.create'))return;
        const expected=currentScope(),parent=folder;
        window.CanvasNameDialog.open({title:'新建画布',label:'画布名称',confirm:'创建',onSubmit:async title=>{
            ensureScope(expected);if(!can('canvas.create'))throw new Error('当前账号没有创建画布的权限');
            const result=await window.CanvasDirectoryApi.createCanvas({title,kind:'smart',icon:'sparkles',folder_id:parent});
            ensureScope(expected);await refresh();
            if(!result.canvas?.id)throw new Error('画布创建结果尚未确认，请刷新目录');
            if(!await window.CanvasNavigation.go(window.CanvasNavigation.canvasUrl(result.canvas.id)))status('画布已创建；当前画布保存完成后可从目录打开');
        }});
    }
    function nameFolder(item,parent=folder){
        if(!can('canvas.edit'))return;
        const expected=currentScope();
        window.CanvasNameDialog.open({title:item?'重命名文件夹':'新建文件夹',label:'文件夹名称',value:item?.name,confirm:item?'保存':'创建',onSubmit:async name=>{
            ensureScope(expected);if(!can('canvas.edit'))throw new Error('当前账号没有修改文件夹的权限');
            const result=item?await window.CanvasDirectoryApi.updateCanvasFolder(item.id,{name}):await window.CanvasDirectoryApi.createCanvasFolder({name,parent_id:parent});
            ensureScope(expected);if(!item&&result.folder?.id){folder=result.folder.id;collapsed.delete(parent);}savePreferences();await refresh();
        }});
    }
    function renameNode(node){
        if(isSmartCanvasLocked()||!nodes.includes(node)||!documentInScope())return;
        const origin=canvas,epoch=window.MemberCanvasEdit?.active?.lease?.epoch;
        window.CanvasNameDialog.open({title:'重命名节点',label:'节点名称',value:nodeLabel(node),onSubmit:async name=>{
            if(canvas!==origin||!nodes.includes(node)||isSmartCanvasLocked()||!documentInScope()||!can('canvas.edit')||window.MemberCanvasEdit?.active?.lease?.epoch!==epoch)throw new Error('节点或编辑资格已变化，请重新打开');
            pushUndo();node.label=name;refreshSmartNodes([node.id]);scheduleSave();documentChanged();
        }});
    }
    function moveCanvas(item){
        if(!can('canvas.edit'))return;
        const expected=currentScope();
        openMenu(panel.querySelector(`[data-canvas-menu="${CSS.escape(item.id)}"]`),[{label:'移到未分类',run:()=>move('')},...folders.map(target=>({label:'移到 '+target.name,run:()=>move(target.id)}))]);
        async function move(target){
            ensureScope(expected);if(!can('canvas.edit')||(item.id===canvas.id&&isSmartCanvasLocked()))throw new Error('请先开始编辑画布');
            if(item.id===canvas.id&&!await saveCanvas({force:true}))throw new Error('当前更改尚未保存，请稍后重试');
            const result=await window.CanvasDirectoryApi.moveCanvasToFolder(item.id,target);ensureScope(expected);
            if(item.id===canvas.id){canvas.folder_id=target;if(Number.isSafeInteger(result.canvas?.revision))canvas.revision=result.canvas.revision;}
            await refresh();
        }
    }
    function renameCanvas(item){
        if(!can('canvas.edit')||(item.id===canvas.id&&isSmartCanvasLocked()))return;
        const expected=currentScope(),origin=canvas,active=item.id===canvas.id,epoch=window.MemberCanvasEdit?.active?.lease?.epoch;
        const valid=()=>!active||(canvas===origin&&!isSmartCanvasLocked()&&window.MemberCanvasEdit?.active?.lease?.epoch===epoch);
        window.CanvasNameDialog.open({title:'重命名画布',label:'画布名称',value:item.title,onSubmit:async title=>{
            ensureScope(expected);if(!can('canvas.edit')||!valid())throw new Error('画布或编辑资格已变化，请重新打开');
            if(active&&!await saveCanvas({force:true}))throw new Error('当前更改尚未保存，请稍后重试');
            ensureScope(expected);if(!valid())throw new Error('编辑资格已变化，请重新打开');
            const result=await window.CanvasDirectoryApi.patchCanvasMeta(item.id,{title});ensureScope(expected);
            if(active&&valid()){
                canvas.title=result.canvas?.title||title;
                if(Number.isSafeInteger(result.canvas?.revision))canvas.revision=result.canvas.revision;
                if(result.canvas?.updated_at)canvas.updated_at=result.canvas.updated_at;
                updateSmartCanvasNav();
            }
            await refresh();
        }});
    }
    function bind(){
        if(panel||disposed)return;
        readPreferences();scope=currentScope();
        panel=document.createElement('aside');panel.id='pixmaxNavigator';panel.className='pixmax-navigator';panel.setAttribute('aria-label','画布和节点目录');
        panel.innerHTML=`<header><a href="${escapeAttr(window.CanvasNavigation.homeUrl())}" data-directory-home aria-label="返回画布管理"><img src="/static/images/shadox-mark.svg" alt=""></a><strong data-directory-title></strong><button type="button" data-directory-close aria-label="关闭画布目录">×</button></header><div role="tablist" aria-label="目录类型"><button type="button" role="tab" data-directory-tab="canvas" aria-controls="pixmaxDirectoryList">画布</button><button type="button" role="tab" data-directory-tab="nodes" aria-controls="pixmaxDirectoryList">节点</button><button type="button" data-directory-refresh aria-label="刷新目录" title="刷新目录"><i data-lucide="refresh-cw"></i></button></div><label class="pixmax-directory-search"><i data-lucide="search"></i><input type="search" data-directory-search aria-label="搜索画布或节点" placeholder="搜索画布或文件夹"></label><div data-directory-creations class="pixmax-directory-creations"><button type="button" data-directory-create-canvas>新建画布</button><button type="button" data-directory-create-folder>新建文件夹</button></div><select data-directory-type aria-label="节点类型"><option value="">全部节点</option>${Object.entries(labels).map(([key,label])=>`<option value="${key}">${label}</option>`).join('')}</select><div class="pixmax-directory-list" id="pixmaxDirectoryList" role="tabpanel" data-folder-drop=""></div><p role="status"></p>`;
        toggleButton=document.createElement('button');toggleButton.type='button';toggleButton.className='pixmax-navigator-toggle';toggleButton.setAttribute('aria-label','画布目录');toggleButton.setAttribute('aria-controls',panel.id);toggleButton.innerHTML='<i data-tabler="layout-sidebar-left-collapse"></i>';
        list=panel.querySelector('.pixmax-directory-list');document.body.append(panel,toggleButton);
        window.lucide?.createIcons({root:panel});window.lucide?.createIcons({root:toggleButton});
        toggleButton.onclick=()=>setOpened(!opened);panel.querySelector('[data-directory-close]').onclick=()=>setOpened(false);
        panel.querySelector('[data-directory-home]').onclick=event=>{if(event.ctrlKey||event.metaKey||event.shiftKey||event.altKey)return;event.preventDefault();void window.CanvasNavigation.go(window.CanvasNavigation.homeUrl());};
        panel.querySelector('[data-directory-search]').oninput=event=>{query=event.target.value;documentChanged();};
        panel.querySelector('[data-directory-type]').onchange=event=>{type=event.target.value;documentChanged();};
        panel.querySelector('[data-directory-create-canvas]').onclick=createCanvas;panel.querySelector('[data-directory-create-folder]').onclick=()=>nameFolder();
        panel.querySelector('[data-directory-refresh]').onclick=refresh;
        panel.onclick=event=>{
            const target=event.target.closest('button,a');if(!target)return;
            if(target.dataset.directoryTab){tab=target.dataset.directoryTab;query='';panel.querySelector('[data-directory-search]').value='';closeMenu();savePreferences();documentChanged();}
            if(target.hasAttribute('data-canvas-open')&&!(event.ctrlKey||event.metaKey||event.shiftKey||event.altKey)){event.preventDefault();if(target.dataset.canvasOpen!==canvas.id)void window.CanvasNavigation.go(target.href);}
            if(target.hasAttribute('data-folder-toggle')){folder=target.dataset.folderToggle;if(collapsed.has(folder))collapsed.delete(folder);else collapsed.add(folder);savePreferences();documentChanged();}
            if(target.dataset.nodeFocus){const node=nodes.find(item=>item.id===target.dataset.nodeFocus);if(node)focusNode(node);}
            if(target.dataset.nodeMenu){const node=nodes.find(item=>item.id===target.dataset.nodeMenu);if(node)openMenu(target,[{label:'定位节点',run:()=>focusNode(node)},{label:'重命名',disabled:isSmartCanvasLocked(),run:()=>renameNode(node)},{label:'标签',run:()=>window.PixmaxTags.openPicker([node.id],target)},{label:(window.PixmaxTags?.ids(node).length??node.pinned)?'取消 pin':'pin 到汇总',disabled:isSmartCanvasLocked(),run:()=>{if(isSmartCanvasLocked()||!nodes.includes(node)||!documentInScope()||!can('canvas.edit'))return;window.PixmaxTags.togglePin(node);documentChanged();}}]);}
            if(target.dataset.canvasMenu){const item=records.find(item=>item.id===target.dataset.canvasMenu);if(item)openMenu(target,[{label:'打开画布',run:()=>item.id!==canvas.id&&window.CanvasNavigation.go(window.CanvasNavigation.canvasUrl(item.id))},{label:'重命名',disabled:!can('canvas.edit')||(item.id===canvas.id&&isSmartCanvasLocked()),run:()=>renameCanvas(item)},{label:'移动到文件夹',disabled:!can('canvas.edit')||(item.id===canvas.id&&isSmartCanvasLocked()),run:()=>moveCanvas(item)}]);}
            if(target.dataset.folderMenu){const item=folders.find(item=>item.id===target.dataset.folderMenu);if(item)openMenu(target,[{label:'新建子文件夹',disabled:!can('canvas.edit'),run:()=>nameFolder(null,item.id)},{label:'重命名',disabled:!can('canvas.edit'),run:()=>nameFolder(item)}]);}
        };
        panel.addEventListener('keydown',event=>{
            event.stopPropagation();if(event.key==='Escape')setOpened(false);
            if(event.target.matches('[data-directory-tab]')&&['ArrowLeft','ArrowRight','Home','End'].includes(event.key)){
                event.preventDefault();const buttons=[...panel.querySelectorAll('[data-directory-tab]')],index=buttons.indexOf(event.target),next=event.key==='Home'?0:event.key==='End'?buttons.length-1:(index+1)%buttons.length;
                buttons[next].click();buttons[next].focus();
            }
        });
        panel.addEventListener('dragstart',event=>{const row=event.target.closest('[data-canvas-row]');if(!row)return;event.dataTransfer.setData('application/x-canvas-id',row.dataset.canvasRow);event.dataTransfer.effectAllowed='move';});
        panel.addEventListener('dragover',event=>{if(can('canvas.edit')&&[...event.dataTransfer.types].includes('application/x-canvas-id')){event.preventDefault();event.dataTransfer.dropEffect='move';}});
        panel.addEventListener('drop',async event=>{
            const target=event.target.closest('[data-folder-drop]'),id=event.dataTransfer.getData('application/x-canvas-id');if(!target||!id)return;event.preventDefault();
            const expected=currentScope();try{
                if(!can('canvas.edit')||(id===canvas.id&&isSmartCanvasLocked()))throw new Error('请先开始编辑画布');
                if(id===canvas.id&&!await saveCanvas({force:true}))throw new Error('当前更改尚未保存，请稍后重试');
                const result=await window.CanvasDirectoryApi.moveCanvasToFolder(id,target.dataset.folderDrop);ensureScope(expected);
                if(id===canvas.id){canvas.folder_id=target.dataset.folderDrop;if(Number.isSafeInteger(result.canvas?.revision))canvas.revision=result.canvas.revision;}await refresh();
            }catch(error){status(error.message);}
        });
        setOpened(opened);draw();void refresh();
    }
    document.addEventListener('pointerdown',event=>{if(menu&&!menu.contains(event.target)&&!event.target.closest('[data-canvas-menu],[data-node-menu],[data-folder-menu]'))closeMenu();});
    window.addEventListener('resize',closeMenu);
    window.addEventListener('pagehide',event=>{requestVersion++;if(frame!==null)cancelAnimationFrame(frame);frame=null;closeMenu();if(!event.persisted)disposed=true;});
    window.addEventListener('pageshow',event=>{if(event.persisted){documentChanged();void refresh();}});
    window.PixmaxNavigator=Object.freeze({bind,refresh,documentChanged,viewportBounds,toggle:()=>panel&&setOpened(!opened)});
})();
