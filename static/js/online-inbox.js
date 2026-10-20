(function(root){
    'use strict';
    const node=(tag,text,cls)=>{const el=document.createElement(tag);if(text!==undefined)el.textContent=text;if(cls)el.className=cls;return el;};
    const button=(text,run,cls)=>{const el=node('button',text,cls);el.type='button';el.addEventListener('click',run);return el;};
    const bytes=n=>{n=Number(n)||0;return n>=1024**3?(n/1024**3).toFixed(2)+' GB':n>=1024**2?(n/1024**2).toFixed(1)+' MB':n>=1024?(n/1024).toFixed(1)+' KB':n+' B';};
    async function json(url,init){
        const response=await fetch(url,init),data=await response.json();
        if(!response.ok)throw Error(typeof data.detail==='string'?data.detail:data.detail?.message || ({permission_denied:'当前角色没有操作权限',workspace_forbidden:'无权访问此空间',authentication_required:'请重新登录'}[data.detail?.code]) || '请求失败，请重试');
        return data;
    }
    function attach(host,{preview}={}){
        host.replaceChildren();host.className='online-inbox';host.id='onlineInbox';
        let state='inbox',cursor=null,hasMore=false,rows=[],selected=new Set(),sequence=0,busy=false,loading=false,readController,searchTimer;
        const heading=node('header',undefined,'inbox-heading'),title=node('div');
        title.append(node('h2','作品收件箱'),node('p','整理每一次灵感。保留喜欢的作品，回收不再需要的尝试。'));
        const summary=node('div','正在统计…','inbox-summary');heading.append(title,summary);
        const tools=node('div',undefined,'inbox-tools'),tabs=node('div',undefined,'inbox-tabs');tabs.setAttribute('role','tablist');tabs.setAttribute('aria-label','作品状态');
        const tabButtons=new Map();
        for(const [key,label] of [['inbox','未整理'],['saved','已保留'],['trash','回收站']]){
            const el=button(label,()=>{if(busy||state===key)return;state=key;syncTabs();void load();});el.setAttribute('role','tab');el.setAttribute('aria-controls','inboxGrid');tabs.append(el);tabButtons.set(key,el);
            el.addEventListener('keydown',e=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;e.preventDefault();const keys=[...tabButtons.keys()];let i=keys.indexOf(state);i=e.key==='Home'?0:e.key==='End'?2:(i+(e.key==='ArrowLeft'?-1:1)+3)%3;tabButtons.get(keys[i]).click();tabButtons.get(keys[i]).focus();});
        }
        function syncTabs(){for(const [key,el] of tabButtons){el.setAttribute('aria-selected',String(key===state));el.tabIndex=key===state?0:-1;}}
        syncTabs();
        const filters=node('div',undefined,'inbox-filters'),search=node('input',undefined,'inbox-search');search.type='search';search.placeholder='搜索名称、提示词或标签';search.setAttribute('aria-label','搜索作品');
        const select=(label,options)=>{const el=node('select');el.setAttribute('aria-label',label);for(const [value,text] of options){const op=node('option',text);op.value=value;el.append(op);}el.addEventListener('change',()=>void load());return el;};
        const owner=select('作品归属',[['all','空间作品'],['mine','我的作品']]);
        const folder=select('作品文件夹',[['','全部文件夹']]),model=select('生成模型',[['','全部模型']]);
        const references=select('作品引用状态',[['all','全部引用状态'],['unreferenced','仅看未引用'],['referenced','仅看已引用']]);
        references.title='按已保存的画布、素材库、备份、任务输入和其他作品判断；自身生成结果不算额外引用。未知状态不列入未引用。';
        search.addEventListener('input',()=>{clearTimeout(searchTimer);searchTimer=setTimeout(()=>void load(),250);});
        const refresh=button('刷新',()=>void load());filters.append(search,owner,folder,model,references,refresh);
        const bulk=node('div',undefined,'inbox-bulk'),count=node('span','已选 0 张'),all=button('全选本页',()=>{const available=rows.filter(r=>r.can_manage);const selecting=available.some(r=>!selected.has(r.id));for(const row of available)selecting?selected.add(row.id):selected.delete(row.id);render();});
        const retain=button('保留作品',()=>void perform('save'), 'inbox-primary'),trash=button('移入回收站',()=>void perform('trash'));
        const restore=button('恢复所选',()=>void perform('restore')),purge=button('彻底删除',()=>void confirmPurge(),'inbox-danger');
        const editFolder=button('整理所选',()=>editMetadata()),canvas=button('加入画布',()=>importSelected('canvas')),library=button('保存到素材库',()=>importSelected('library'));
        bulk.append(count,all,retain,editFolder,canvas,library,trash,restore,purge);tools.append(tabs,filters,bulk);
        const status=node('div','', 'inbox-status');status.setAttribute('role','status');status.setAttribute('aria-live','polite');
        const grid=node('div',undefined,'inbox-grid');grid.id='inboxGrid';grid.setAttribute('role','tabpanel');grid.setAttribute('aria-label','在线作品');
        const more=button('加载更多',()=>void load(true),'inbox-more');more.hidden=true;
        const note=node('p','未引用筛选按已保存的画布、素材库、备份、任务输入及其他作品判断，自身生成结果不计入；未托管或状态未知的图片不列入未引用。删除前会重新检查。自动清理暂未启用，移入回收站仍占用空间。','inbox-footnote');
        host.append(heading,tools,status,grid,more,note);
        function message(text,error=false){status.textContent=text;status.classList.toggle('error',error);}
        function picked(){return rows.filter(row=>selected.has(row.id));}
        function sync(){
            count.textContent=`已选 ${selected.size} 张`;const empty=!selected.size;
            for(const el of [retain,editFolder,canvas,library,trash,restore,purge])el.disabled=empty||busy||loading;
            for(const el of [retain,editFolder,canvas,library,trash])el.hidden=state==='trash';
            restore.hidden=purge.hidden=state!=='trash';all.disabled=busy||loading||!rows.some(r=>r.can_manage);more.disabled=busy||loading;
            for(const el of [search,owner,folder,model,references,refresh,...tabButtons.values()])el.disabled=busy;
        }
        function updateFacets(control,values,label){const value=control.value;control.replaceChildren();for(const item of ['',...values]){const op=node('option',item||label);op.value=item;control.append(op);}control.value=values.includes(value)?value:'';}
        async function load(append=false){
            if(busy)return;if(append&&!hasMore)return;
            const token=++sequence;readController?.abort();readController=new AbortController();
            if(!append){selected.clear();}
            // Keep the old view mounted until its replacement is ready. Removing it
            // early clamps the document scroll position, especially near the footer.
            grid.style.minHeight=Math.max(148,grid.getBoundingClientRect().height)+'px';
            loading=true;grid.inert=true;sync();
            grid.setAttribute('aria-busy','true');message('加载作品中…');more.disabled=true;
            const query=new URLSearchParams({state,q:search.value,owner:owner.value,folder:folder.value,model:model.value,references:references.value,limit:'30'});if(append&&cursor)query.set('cursor',cursor);
            try{
                const data=await json('/api/online-works?'+query,{signal:readController.signal});if(token!==sequence)return;
                rows=append?[...rows,...data.items]:data.items;cursor=data.next_cursor;hasMore=Boolean(cursor);more.hidden=!hasMore;
                const stats=data.summary,counts=stats.counts||{};
                summary.textContent=`未整理 ${counts.inbox||0} · 已保留 ${counts.saved||0} · 回收站 ${(counts.trash||0)+(counts.purging||0)} ｜在线原件 ${bytes(Object.values(stats.bytes||{}).reduce((a,b)=>a+Number(b),0))}`;
                updateFacets(folder,data.folders||[],'全部文件夹');updateFacets(model,data.models||[],'全部模型');render();message('');
            }catch(error){if(token===sequence&&error.name!=='AbortError'){message(error.message+'，点击刷新重试',true);if(!append){rows=[];cursor=null;hasMore=false;more.hidden=true;render();}}}
            finally{if(token===sequence){loading=false;grid.inert=false;grid.style.minHeight='';grid.setAttribute('aria-busy','false');sync();}}
        }
        function render(){
            grid.replaceChildren();
            if(!rows.length)grid.append(node('div',search.value||owner.value!=='all'||folder.value||model.value||references.value!=='all'?'没有匹配的作品':state==='trash'?'回收站为空':state==='saved'?'还没有保留的作品':'收件箱为空，生成的作品会出现在这里','inbox-empty'));
            for(const row of rows){
                const card=node('article',undefined,'inbox-card'),cover=node('div',undefined,'inbox-cover');
                const open=button('查看图片',()=>preview?.({...row.snapshot,online_work_id:row.id}));open.setAttribute('aria-label','预览 '+row.name);open.textContent='';
                const unavailable=row.state==='purging'||['deleted','deleting'].includes(row.asset_status),url=row.snapshot.images?.[0];
                if(!unavailable&&url){
                    const img=node('img');img.alt=row.name;img.loading='lazy';img.decoding='async';img.src=root.MemberMediaUrl?root.MemberMediaUrl('/api/media-preview?'+new URLSearchParams({url,w:'480'})):url;
                    img.addEventListener('error',()=>{img.remove();open.textContent='预览暂不可用';},{once:true});open.append(img);
                }else{open.textContent='清理待完成';open.disabled=true;}
                const label=node('label',undefined,'inbox-select'),check=node('input');check.type='checkbox';check.checked=selected.has(row.id);check.disabled=!row.can_manage||busy;check.setAttribute('aria-label','选择 '+row.name);
                check.addEventListener('change',()=>{check.checked?selected.add(row.id):selected.delete(row.id);sync();});label.append(check);
                cover.append(open,label,node('span',unavailable?'待重试':row.folder||'未分类','inbox-badge'));
                const body=node('div',undefined,'inbox-card-body'),name=node('h3',row.name);name.title=row.name;
                const date=new Date(row.created_at).toLocaleString('zh-CN',{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'});
                body.append(name,node('div',row.owner_name,'inbox-meta'),node('div',`${row.snapshot.model||'历史模型'} · ${date} · ${row.size_bytes==null?'大小未知':bytes(row.size_bytes)}`,'inbox-meta'));
                if(row.tags?.length)body.append(node('div',row.tags.join(' / '),'inbox-meta'));
                const actions=node('div',undefined,'inbox-card-actions');
                if(state!=='trash'){
                    if(row.can_manage){actions.append(button('整理',()=>editMetadata(row)),button('回收',()=>void perform('trash',[row])));}
                    if(url&&!unavailable)actions.append(button('加入画布',()=>root.OnlineImports?.open({...row.snapshot,online_work_id:row.id},'canvas')),button('素材库',()=>root.OnlineImports?.open({...row.snapshot,online_work_id:row.id},'library')));
                }else if(row.can_manage){
                    if(!unavailable)actions.append(button('恢复',()=>void perform('restore',[row])));
                    actions.append(button(unavailable?'重试清理':'彻底删除',()=>void confirmPurge([row]),'inbox-danger'));
                }
                if(row.asset_id)actions.append(button('查看引用',()=>void showReferences(row)));
                body.append(actions);card.append(cover,body);grid.append(card);
            }
            sync();
        }
        async function perform(action,targets=picked(),metadata={},confirmPermanent=false){
            if(!targets.length||busy||loading)return;
            busy=true;++sequence;readController?.abort();sync();host.querySelectorAll('.inbox-card button,.inbox-card input').forEach(el=>el.disabled=true);message(action==='purge'?'正在清理文件…':'正在保存…');
            try{
                let result;
                if(targets.length>200)throw Error('每次最多处理200张作品，请分批操作');
                result=await json('/api/online-works/actions',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,items:targets.map(r=>({id:r.id,revision:r.revision})),metadata,confirm_permanent:confirmPermanent})});
                busy=false;await load();
                message(result.failures?.length?result.failures.map(f=>f.message).join('\n'):action==='purge'?`已清理 ${result.changed} 张作品，释放 ${bytes(result.freed_bytes)}${result.records_only?'；外部链接仅删除记录':''}`:action==='trash'?'已移入回收站，可以恢复':action==='restore'?'作品已恢复':'整理已保存',Boolean(result.failures?.length));
            }catch(error){busy=false;render();message(error.message,true);}
            finally{busy=false;sync();}
        }
        function modal(titleText,fill){
            const previous=document.activeElement,dialog=node('dialog',undefined,'inbox-dialog');dialog.append(node('h3',titleText));document.body.append(dialog);
            dialog.addEventListener('close',()=>{dialog.remove();if(previous?.isConnected)previous.focus();});dialog.addEventListener('click',e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dialog.close();}});
            fill(dialog);dialog.showModal();return dialog;
        }
        function editMetadata(single){
            const targets=single?[single]:picked();if(!targets.length)return;
            modal(single?'整理作品':`整理 ${targets.length} 张作品`,dialog=>{
                const form=node('form');form.method='dialog';const inputs={};
                for(const [key,labelText,value] of [...(single?[['name','作品名称',single.name]]:[]),['folder','文件夹',single?.folder||''],['tags','标签（用逗号分隔）',single?.tags?.join(', ')||'']]){
                    const label=node('label',labelText),input=node('input');input.value=value;input.maxLength=key==='name'?240:key==='folder'?80:819;if(key==='name')input.required=true;label.append(input);form.append(label);inputs[key]=input;
                }
                if(!single)form.append(node('p','填写的文件夹和标签将替换所选作品原有值。'));
                const footer=node('footer'),cancel=button('取消',()=>dialog.close()),submit=node('button','保存','inbox-primary');submit.type='submit';footer.append(cancel,submit);form.append(footer);dialog.append(form);
                form.addEventListener('submit',e=>{e.preventDefault();const metadata={folder:inputs.folder.value,tags:inputs.tags.value.split(/[,，]/).map(t=>t.trim()).filter(Boolean)};if(single)metadata.name=inputs.name.value;dialog.close();void perform('edit',targets,metadata);});
            });
        }
        function confirmPurge(targets=picked()){
            if(!targets.length)return;
            modal('彻底删除作品',dialog=>{
                dialog.append(node('p',`将彻底删除 ${targets.length} 张作品及可清理的原图、缩略图。此操作无法恢复。\n仍被画布、素材库、备份或待处理任务使用的文件会被保护；模型和费用记录继续保留。`));
                const footer=node('footer');footer.append(button('取消',()=>dialog.close()),button('确认彻底删除',()=>{dialog.close();void perform('purge',targets,{},true);},'inbox-danger'));dialog.append(footer);
            });
        }
        function importSelected(destination){root.OnlineImports?.open(picked().map(row=>({...row.snapshot,online_work_id:row.id})),destination);}
        async function showReferences(row){
            try{
                const response=await json('/api/canvas-assets/references/'+encodeURIComponent(row.asset_id));
                const references=Array.isArray(response)?response:response.references||[];
                modal('作品引用',dialog=>{dialog.append(node('p',references.length?references.map(r=>`${r.canvas_title} · ${r.node_title}${r.canvas_trashed?'（画布在回收站）':''}`).join('\n'):'当前没有画布节点引用。素材库、备份及任务引用将在彻底删除时再次检查。'));const footer=node('footer');footer.append(button('关闭',()=>dialog.close()));dialog.append(footer);});
            }catch(error){message(error.message,true);}
        }
        root.addEventListener('online-import-complete',event=>{
            if(event.detail.destination==='library')void load();
        });
        root.addEventListener('member-session:paused',()=>{++sequence;readController?.abort();clearTimeout(searchTimer);host.inert=true;message('身份或空间权限已变化，请重新打开页面',true);});
        root.addEventListener('pagehide',()=>{clearTimeout(searchTimer);readController?.abort();},{once:true});
        const api={refresh:()=>load(),ready:load()};return api;
    }
    root.OnlineInbox={attach};
})(window);
