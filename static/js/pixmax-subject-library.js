/* Native subject cards with the host's scoped catalog and media lifecycle. */
(() => {
    'use strict';
    const element=(tag,text)=>{const value=document.createElement(tag);if(text!==undefined)value.textContent=text;return value;};
    const button=(text,action)=>{const value=element('button',text);value.type='button';value.onclick=action;return value;};
    async function open({api,node,valid,onChoose,onRoot,onClose}){
        const roots=new Set(),main=pixmaxCreationModal('主体库'),body=main.querySelector('.pixmax-creation-content'),status=main.querySelector('[role=status]');
        let catalogs,ownerType='PERSONAL',cards,closed=false,busy=false;
        const current=()=>!closed&&main.isConnected&&valid();
        function track(root){roots.add(root);onRoot?.(root,true);return root;}
        track(main);main.classList.add('pixmax-subject-library');
        if(!document.getElementById('pixmax-subject-library-style')){
            const style=element('style');style.id='pixmax-subject-library-style';style.textContent='.pixmax-subject-library>section{width:min(720px,calc(100vw - 32px))}.pixmax-subject-library nav,.pixmax-subject-library header,.pixmax-subject-items header{display:flex;gap:8px;flex-wrap:wrap;align-items:center}.pixmax-subject-library nav button[aria-selected=true]{border-color:var(--studio-focus,#7894ff)}.pixmax-subject-library input[type=search]{width:100%;margin:12px 0}.pixmax-subject-items article{padding:10px;margin:8px 0;border:1px solid var(--studio-border,#444);border-radius:10px}.pixmax-subject-items article p{white-space:pre-wrap;overflow-wrap:anywhere}.pixmax-subject-items img,.pixmax-subject-items video{width:100%;max-height:180px;object-fit:contain}.pixmax-subject-items audio{max-width:100%}.pixmax-subject-items header strong{flex:1}.pixmax-subject-latest{white-space:pre-wrap;padding:8px;border:1px solid var(--studio-border,#444)}@media(max-width:480px){.pixmax-subject-library [data-subject-cards]>div>div,.pixmax-subject-library [data-subject-cards]>div>button{width:calc((100% - .75rem)/2)}}';document.head.append(style);
        }
        const navigation=element('nav');navigation.setAttribute('role','tablist');
        for(const [type,name] of [['PERSONAL','我的主体'],['TEAM','空间主体']]){
            const tab=button(name,()=>{ownerType=type;draw();});tab.setAttribute('role','tab');tab.dataset.subjectOwner=type;navigation.append(tab);
        }
        const search=element('input');search.type='search';search.placeholder='搜索主体';search.setAttribute('aria-label','搜索主体');search.oninput=()=>draw();
        const controls=element('header'),reload=button('重新加载',()=>void load()),add=button('新建主体',()=>edit());
        controls.append(add,reload);const cardTarget=element('div');cardTarget.dataset.subjectCards='';body.append(navigation,search,controls,cardTarget);
        const observer=new MutationObserver(()=>{if(!main.isConnected){destroy();return;}for(const root of roots)if(!root.isConnected){roots.delete(root);onRoot?.(root,false);}});observer.observe(document.body,{childList:true});
        function destroy(){if(closed)return;closed=true;observer.disconnect();cards?.destroy();cards=null;catalogs=null;for(const root of roots){for(const media of root.querySelectorAll('video,audio')){media.pause();media.removeAttribute('src');media.load();}root.remove();onRoot?.(root,false);}roots.clear();onClose?.(handle);}
        function canManage(){return Boolean(catalogs?.[ownerType]?.can_manage)&&current();}
        function draw(){
            if(!current())return;
            for(const tab of navigation.children)tab.setAttribute('aria-selected',String(tab.dataset.subjectOwner===ownerType));
            const groups=(catalogs?.[ownerType]?.groups||[]).filter(group=>group.name.toLocaleLowerCase().includes(search.value.toLocaleLowerCase()));
            cards?.setGroups(groups.map(group=>({...group,coverUrl:group.cover_url?displayMediaUrl({url:group.cover_url}):'',ownerType})));
            add.disabled=busy||!canManage();reload.disabled=busy;cardTarget.inert=busy;
            status.textContent=groups.length?`${groups.length} 个主体 · 可查看或应用到当前节点`:'暂无主体，可新建主体并添加文字或素材。';
        }
        async function load(){
            if(!current())return;busy=true;draw();status.textContent='正在读取主体…';
            let failure;
            try{const data=await PixmaxSubjects.request('/api/subject-library');if(!current())return;catalogs=data.catalogs;}
            catch(error){failure=error.message;}
            finally{busy=false;if(!current())destroy();else{draw();if(failure)status.textContent=failure;}}
        }
        async function choose(view){
            if(!current()||busy)return;busy=true;draw();
            try{const data=await PixmaxSubjects.details(view.ownerType,view.id);if(!current())return;
                await onChoose(data.group,view.ownerType);if(current())destroy();
            }catch(error){if(current())status.textContent=error.message;}
            finally{busy=false;if(current()){cardTarget.inert=false;add.disabled=!canManage();reload.disabled=false;}}
        }
        function field(form,label,value,{multiline=false,maxLength=160}={}){
            const row=element('label',label),input=element(multiline?'textarea':'input');input.value=value||'';input.maxLength=maxLength;row.append(input);form.append(row);return input;
        }
        function edit(view){
            if(!current())return;
            const type=view?.ownerType||ownerType,root=track(pixmaxCreationModal(view?'编辑主体':'新建主体')),content=root.querySelector('.pixmax-creation-content'),notice=root.querySelector('[role=status]');
            root.classList.add('pixmax-subject-library');let group=view?catalogs[type].groups.find(group=>group.id===view.id):null,revision=catalogs[type].revision,working=false;
            const live=()=>current()&&root.isConnected,manage=()=>live()&&catalogs[type].can_manage;
            const form=element('form'),name=field(form,'主体名称',group?.name),description=field(form,'主体描述',group?.description,{multiline:true,maxLength:1000});name.required=true;
            const save=element('button','保存主体');save.type='submit';form.append(save);
            const latest=element('p');latest.className='pixmax-subject-latest';latest.hidden=true;
            const readLatest=button('读取最新版本',async()=>{if(!live()||working)return;try{
                const data=await PixmaxSubjects.request('/api/subject-library');if(!live())return;catalogs=data.catalogs;revision=catalogs[type].revision;
                const next=group?catalogs[type].groups.find(value=>value.id===group.id):null;
                if(group&&!next)throw Error('主体已删除，请关闭此窗口并重新选择。');
                if(next){group=next;drawItems();}
                latest.hidden=false;latest.textContent=next?'最新主体：'+next.name+'\n'+next.description:'最新目录已读取。';
                save.textContent='按当前草稿保存';notice.textContent='草稿已保留。请核对最新内容，再点击保存。';draw();
            }catch(error){if(live())notice.textContent=error.message;}});readLatest.hidden=true;content.append(form,latest,readLatest);
            const items=element('section');items.className='pixmax-subject-items';content.append(items);
            function sync(){for(const control of root.querySelectorAll('input,textarea,button'))if(!control.matches('[data-creation-close]'))control.disabled=working||!manage();}
            async function mutate(path,init,onSaved){
                if(!manage()||working)return false;working=true;sync();notice.textContent='正在保存主体…';
                try{const data=await PixmaxSubjects.request(path,{...init,body:init.body?JSON.stringify({...init.body,expected_revision:revision}):undefined});if(!live())return;
                    catalogs[type]=data.catalog;revision=data.catalog.revision;group=group?data.catalog.groups.find(value=>value.id===group.id):data.catalog.groups.find(value=>value.id===data.target_id);notice.textContent='主体已保存';readLatest.hidden=true;latest.hidden=true;draw();drawItems();onSaved?.();return true;
                }catch(error){if(live()){notice.textContent=error.message;readLatest.hidden=error.status!==409;}}
                finally{working=false;if(live())sync();}
            }
            form.onsubmit=event=>{event.preventDefault();if(!form.reportValidity())return;void mutate('/api/subject-library/'+type+'/groups'+(group?'/'+group.id:''),{method:group?'PATCH':'POST',body:{name:name.value,description:description.value}});};
            function addText(item){
                if(!group||!manage())return;const dialog=track(pixmaxCreationModal(item?'编辑主体文字':'添加主体文字')),section=dialog.querySelector('.pixmax-creation-content'),textForm=element('form');
                const title=field(textForm,'素材名称',item?.name||'文字'),text=field(textForm,'文字正文',item?.text,{multiline:true,maxLength:10000});title.required=text.required=true;
                const confirm=element('button','保存文字');confirm.type='submit';textForm.append(confirm);section.append(textForm);
                const reread=button('读取最新版本',async()=>{if(!dialog.isConnected||working)return;await readLatest.onclick();if(!dialog.isConnected)return;
                    const latestItem=item?catalogs[type].groups.find(value=>value.id===group.id)?.items.find(value=>value.id===item.id):null;
                    dialog.querySelector('[role=status]').textContent=(latestItem?'最新文字：'+latestItem.text+'\n':'')+notice.textContent;confirm.textContent='按当前草稿保存';});reread.hidden=true;section.append(reread);
                textForm.onsubmit=async event=>{event.preventDefault();if(!textForm.reportValidity()||!dialog.isConnected)return;const saved=await mutate('/api/subject-library/'+type+'/groups/'+group.id+'/items'+(item?'/'+item.id:''),{method:item?'PATCH':'POST',body:{name:title.value,text:text.value,...(item?{}:{kind:'text'})}},()=>dialog.remove());if(!saved&&dialog.isConnected){dialog.querySelector('[role=status]').textContent=notice.textContent;reread.hidden=readLatest.hidden;}};
            }
            async function addMedia(){
                if(!group||!manage())return;const dialog=track(pixmaxCreationModal('添加主体素材')),section=dialog.querySelector('.pixmax-creation-content'),message=dialog.querySelector('[role=status]'),list=element('div'),query=element('input');query.type='search';query.setAttribute('aria-label','搜索主体素材');query.placeholder='搜索素材';section.append(query,list);
                const available=()=>dialog.isConnected&&manage()&&!working,candidates=[];
                const draw=()=>{list.replaceChildren();for(const item of candidates.filter(item=>item.name.toLocaleLowerCase().includes(query.value.toLocaleLowerCase()))){const pick=button(item.name,()=>{if(!available())return;void mutate('/api/subject-library/'+type+'/groups/'+group.id+'/items',{method:'POST',body:{kind:assetMediaKind(item),name:item.name.slice(0,160),url:item.url,...(item.asset_item_id?{asset_item_id:item.asset_item_id,library_id:item.library_id}:{})}},()=>dialog.remove());});list.append(pick);}};query.oninput=draw;
                for(const source of nodes.filter(source=>!source.hidden))for(const item of source.images||[])if(['image','audio','video'].includes(mediaKindForItem(item)))candidates.push({...item,name:source.label||item.name||'画布素材'});
                draw();
                if(CanvasSession.context.workspace.permissions.includes('asset.upload')){
                    const file=element('input');file.type='file';file.accept='image/*,audio/*,video/*';file.setAttribute('aria-label','上传主体素材');section.prepend(file);
                    file.onchange=async()=>{if(!available()||!file.files[0])return;file.disabled=true;try{const uploaded=await uploadFiles([file.files[0]]);if(!available())return;const item=uploaded[0];if(!item)throw Error('素材上传失败');void mutate('/api/subject-library/'+type+'/groups/'+group.id+'/items',{method:'POST',body:{kind:mediaKindForItem(item),name:(item.name||file.files[0].name).slice(0,160),url:item.url}},()=>dialog.remove());}catch(error){if(available())message.textContent=error.message;}finally{if(available())file.disabled=false;}};
                }
                try{const value=await CanvasApi.getAssetLibrary();if(!available())return;const library=value.library||value;
                    for(const source of library.libraries||[{id:'default',categories:library.categories||[]}])for(const category of source.categories||[])for(const item of category.items||[])if(['image','audio','video'].includes(assetMediaKind(item))&&item.url)candidates.push({...item,name:item.name||'资产素材',asset_item_id:item.id,library_id:source.id});draw();
                }catch(error){if(available())message.textContent=error.message;}
            }
            function drawItems(){
                for(const media of items.querySelectorAll('audio,video')){media.pause();media.removeAttribute('src');media.load();}items.replaceChildren();if(!group){items.append(element('p','先保存主体，再添加文字或素材。'));return;}
                const actions=element('header');actions.append(button('添加文字',()=>addText()),button('添加素材',()=>void addMedia()),button('删除主体',()=>void mutate('/api/subject-library/'+type+'/groups/'+group.id+'?expected_revision='+revision,{method:'DELETE'},()=>root.remove())));items.append(actions);
                for(const item of group.items){const row=element('article'),head=element('header');head.append(element('strong',item.name));
                    if(item.kind==='text'){head.append(button('编辑文字',()=>addText(item)));row.append(head,element('p',item.text));}
                    else{row.append(head);const media=element(item.kind==='image'?'img':item.kind==='audio'?'audio':'video');media.src=displayMediaUrl(item);if(item.kind==='image')media.alt=item.name;else{media.controls=true;media.preload='metadata';}row.append(media);}
                    if(item.kind==='image')head.append(button('设为封面',()=>void mutate('/api/subject-library/'+type+'/groups/'+group.id,{method:'PATCH',body:{cover_item_id:item.id}})));
                    head.append(button('移除素材',()=>void mutate('/api/subject-library/'+type+'/groups/'+group.id+'/items/'+item.id+'?expected_revision='+revision,{method:'DELETE'})));items.append(row);
                }
                sync();
            }
            drawItems();sync();
        }
        const handle={root:main,destroy,sync(){if(!current()){destroy();return;}cards?.setDisabled(busy);cardTarget.inert=busy;}};
        try{const mounted=await api.mountSubjects(cardTarget,{groups:[],onView:edit,onApplyAll:view=>void choose(view),onPickGroup:view=>void choose(view)});if(!current()){mounted.destroy();destroy();return handle;}cards=mounted;await load();}
        catch(error){if(current())status.textContent=error.message;}
        return handle;
    }
    window.PixmaxSubjectLibrary=Object.freeze({open});
})();
