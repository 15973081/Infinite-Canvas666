/* Online results enter existing workspace APIs; no generation or media upload is repeated. */
(function(root){
    'use strict';
    const hash=value=>{let n=2166136261;for(const c of value)n=Math.imul(n^c.charCodeAt(0),16777619);return (n>>>0).toString(16);};
    const entriesFor=data=>(Array.isArray(data)?data:[data]).filter(entry=>Array.isArray(entry?.images) && entry.images.some(value=>typeof value==='string'?Boolean(value):Boolean(value?.url)));
    function itemsFor(data){
        const seen=new Set();
        return entriesFor(data).flatMap(entry=>entry.images.map((value,index)=>{
            const item=typeof value==='string'?{url:value}:value;
            return item?.url?{...item,kind:'image',name:item.name || `在线生成 ${entry.timestamp || ''} · ${index+1}`}:null;
        })).filter(value=>value?.url && !seen.has(value.url) && seen.add(value.url));
    }
    function mergeCanvas(document,data,includePrompt=true){
        const result=JSON.parse(JSON.stringify(document));
        result.nodes ||= [];result.connections ||= [];
        let added=0;
        for(const entry of entriesFor(data))added+=appendResult(result,entry,includePrompt);
        return {document:result,added};
    }
    function appendResult(result,data,includePrompt){
        const items=itemsFor(data);
        const identity=JSON.stringify([data.timestamp || '',items.map(item=>item.url)]);
        const source=hash(identity)+hash([...identity].reverse().join(''));
        const key='online-'+source,smart=result.kind==='smart';
        const existing=new Set(result.nodes.map(node=>node.online_import_key));
        const left=result.nodes.length?Math.max(...result.nodes.map(node=>(Number(node.x)||0)+(Number(node.w)||320)))+64:80;
        const x=left+(includePrompt && data.prompt?360:0);
        const y=result.nodes.length?Math.min(...result.nodes.map(node=>Number(node.y)||0)):120;
        let added=0;
        items.forEach((item,index)=>{
            const itemKey=key+'-'+index;if(existing.has(itemKey))return;
            const media={...item,online_import_key:itemKey};
            result.nodes.push(smart?{id:itemKey,type:'smart-image',x:x+(index%3)*360,y:y+Math.floor(index/3)*380,images:[media],promptDraftText:data.prompt || '',online_import_key:itemKey}
                :{id:itemKey,type:'image',x:x+(index%3)*360,y:y+Math.floor(index/3)*380,url:item.url,name:item.name,mediaKind:'image',online_import_key:itemKey});
            added++;
        });
        if(includePrompt && data.prompt && !existing.has(key+'-prompt')){
            result.nodes.push({id:key+'-prompt',online_import_key:key+'-prompt',type:smart?'smart-prompt':'prompt',x:x-360,y,text:data.prompt,title:'在线生成提示词',w:316,h:194,llmEnabled:false});added++;
        }
        return added;
    }
    function createClient({session,transport,Lease}){
        const completed=new Map(),pending=new Map();
        function scope(permission){
            if(!session?.enabled || session.paused || !session.context)throw new Error('请在已登录的工作空间中导入。');
            const context=session.context;
            if(!context.workspace.permissions?.includes(permission))throw new Error('当前角色没有导入权限。');
            const signature=context.member.id+':'+context.workspace.id;
            return ()=>{
                if(session.paused || !session.context || signature!==session.context.member.id+':'+session.context.workspace.id)throw new Error('账号或工作空间已改变，请重新选择导入目标。');
                if(!session.context.workspace.permissions?.includes(permission))throw new Error('当前角色没有导入权限。');
                if(!['normal','scheduled'].includes(session.maintenance?.mode || 'normal'))throw new Error('维护期间暂时无法导入，请稍后重试。');
            };
        }
        async function json(url,init={}){
            const response=await transport(url,{...init,signal:AbortSignal.timeout(30000)});
            const data=await response.json();
            if(!response.ok)throw new Error(typeof data.detail==='string'?data.detail: data.detail?.message || ({permission_denied:'当前角色没有操作权限。',canvas_revision_conflict:'画布版本已更新，请重新导入。'}[data.detail?.code]) || '请求未完成，请重试。');
            return data;
        }
        const body=value=>({method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(value)});
        async function toLibrary(data,target){
            const valid=scope('asset.manage'),items=itemsFor(data);if(!items.length)throw new Error('没有可导入的图片。');
            const key=JSON.stringify([session.context.member.id,session.context.workspace.id,target,items.map(item=>item.url)]);
            if(completed.has(key))return completed.get(key);
            if(pending.has(key))return pending.get(key);
            const operation=(async()=>{
                const saved=[];let interruption='';
                try{
                    // The existing endpoint accepts at most 200 items per request.
                    for(let offset=0;offset<items.length;offset+=200){
                        valid();
                        const result=await json('/api/asset-library/items/batch',body({...target,items:items.slice(offset,offset+200)}));
                        saved.push(...(result.items || []));valid();
                    }
                }catch(error){valid();if(!saved.length)throw error;interruption=error.message;}
                if(!saved.length)throw new Error('未能保存图片，请检查原图是否仍然可用。');
                // Batch APIs may skip unavailable files. Keep the acknowledgement so
                // retrying the same batch cannot duplicate its successful items.
                const receipt={count:saved.length,items:saved,notice:saved.length===items.length?'':`已保存 ${saved.length}/${items.length} 张图片，${interruption || '其余原图不可用'}，请在素材库核对。`};completed.set(key,receipt);return receipt;
            })();pending.set(key,operation);
            try{return await operation;}finally{pending.delete(key);}
        }
        async function toCanvas(data,target){
            const valid=scope('canvas.edit');if(!itemsFor(data).length)throw new Error('没有可导入的图片。');
            if(!Lease)throw new Error('编辑权限组件未加载，请刷新页面后重试。');
            let id=target.id,document,lease;
            if(!id){scope('canvas.create');valid();const entries=entriesFor(data);const title=entries.length>1?`在线生成作品 · ${entries.length} 条`:(entries[0]?.prompt || '在线生成作品');const created=await json('/api/canvases',body({title:title.slice(0,60),kind:target.kind || 'classic',icon:'photo'}));valid();id=created.canvas.id;target.id=id;}
            lease=new Lease({id,fetch:transport});
            lease.setMaintenance(session.maintenance?.mode || 'normal');
            let saved=false;
            try{
                await lease.start(async()=>{valid();document=(await json('/api/canvases/'+encodeURIComponent(id))).canvas;valid();return document;});
                valid();lease.setMaintenance(session.maintenance?.mode || 'normal');if(!lease.canEdit)throw new Error('尚未取得此画布的编辑权限。');
                const merged=mergeCanvas(document,data,target.includePrompt!==false);
                if(merged.added){
                    const response=await lease.write('/api/canvases/'+encodeURIComponent(id),{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(merged.document)});
                    const result=await response.json();valid();
                    if(!response.ok)throw new Error(typeof result.detail==='string'?result.detail:'画布导入未完成，请核对后重试。');
                    if(result.canvas?.id!==id || !Number.isSafeInteger(result.canvas.revision))throw new Error('画布保存尚未确认，请重新打开核对。');
                    document=result.canvas;
                }
                saved=true;
                const released=await lease.finish(async()=>true);
                return {canvas:document,added:merged.added,notice:released?'':'图片已保存，结束编辑尚未确认，请稍后打开画布。'};
            }catch(error){
                if(saved)return {canvas:document,added:itemsFor(data).length,notice:'图片已保存，结束编辑尚未确认，请稍后打开画布。'};
                throw error;
            }finally{
                if(!saved && lease.canSave){try{await lease.finish(async()=>true);}catch(_){} }
                lease.dispose();
            }
        }
        return {json,toCanvas,toLibrary};
    }
    const api={entriesFor,itemsFor,mergeCanvas,createClient};
    if(typeof module==='object' && module.exports){module.exports=api;return;}
    root.OnlineImports=api;
    let client,dialog,state,opening=0;
    const cardResults=new WeakMap();
    const element=(tag,text,className)=>{const el=document.createElement(tag);if(text!==undefined)el.textContent=text;if(className)el.className=className;return el;};
    const field=(label,control)=>{const el=element('label',undefined,'online-import-field');el.append(element('span',label),control);return el;};
    const option=(value,label)=>{const el=element('option',label);el.value=value;return el;};
    const can=permission=>root.CanvasSession?.context?.workspace.permissions?.includes(permission);
    function getClient(){return client ||= createClient({session:root.CanvasSession,transport:(...args)=>root.fetch(...args),Lease:root.CanvasEditLease});}
    function link(label,path){const el=element('a',label,'online-import-link');el.href=root.CanvasSession.url(path);el.target='_blank';el.rel='noopener';return el;}
    function ensureDialog(){
        if(dialog)return;
        dialog=element('dialog',undefined,'online-import-dialog');dialog.id='onlineImportDialog';dialog.setAttribute('aria-labelledby','onlineImportTitle');
        const title=element('h2','导入作品');title.id='onlineImportTitle';
        const close=element('button','关闭','online-import-close');close.type='button';close.addEventListener('click',()=>{if(!state?.busy)dialog.close();});
        const header=element('header');header.append(title,close);
        const summary=element('p',undefined,'online-import-summary');
        const form=element('form'),fields=element('div',undefined,'online-import-fields'),message=element('p',undefined,'online-import-message');message.setAttribute('role','status');message.setAttribute('aria-live','polite');
        const submit=element('button','导入','online-import-submit');submit.type='submit';submit.disabled=true;
        form.append(fields,message,submit);dialog.append(header,summary,form);document.body.append(dialog);
        dialog.addEventListener('cancel',event=>{if(state?.busy)event.preventDefault();});
        dialog.addEventListener('close',()=>{opening++;state=null;});
        form.addEventListener('submit',event=>{event.preventDefault();void perform();});
        dialog.ui={title,close,summary,form,fields,message,submit};
    }
    function showMessage(text,error=false){dialog.ui.message.textContent=text;dialog.ui.message.classList.toggle('error',error);}
    function refreshCanvasFields(){
        const {fields,submit}=dialog.ui;fields.replaceChildren();
        const search=element('input');search.type='search';search.id='onlineImportCanvasSearch';search.placeholder='输入画布名称…';search.autocomplete='off';search.setAttribute('aria-controls','onlineImportCanvas');
        const select=element('select');select.id='onlineImportCanvas';
        const matches=element('p',undefined,'online-import-search-status');matches.id='onlineImportCanvasMatches';matches.setAttribute('role','status');matches.setAttribute('aria-live','polite');search.setAttribute('aria-describedby',matches.id);
        const normalize=value=>String(value || '').normalize('NFKC').trim().toLocaleLowerCase();
        const update=(initial=false)=>{
            const previous=initial?state.preferred:select.value,query=normalize(search.value);
            const canvases=state.canvases.filter(canvas=>normalize(canvas.title || '未命名画布').includes(query));
            select.replaceChildren();
            const placeholder=option('','请选择目标画布');placeholder.disabled=true;select.append(placeholder);
            if(can('canvas.create')){
                const group=element('optgroup');group.label='新建画布';group.append(option('new:classic','新建经典画布'),option('new:smart','新建智能画布'));select.append(group);
            }
            if(canvases.length){
                const group=element('optgroup');group.label=query?'匹配的已有画布':'已有画布';
                for(const canvas of canvases)group.append(option(canvas.id,(canvas.kind==='smart'?'智能 · ':'经典 · ')+(canvas.title || '未命名画布')));
                select.append(group);
            }
            const remains=previous && [...select.options].some(o=>o.value===previous) && !(query && previous.startsWith('new:'));
            select.value=remains?previous:initial?(can('canvas.create')?'new:classic':canvases[0]?.id || ''):'';
            if(!initial && select.value!==previous)state.createdTarget=null;
            submit.disabled=!select.value || !can('canvas.edit');
            matches.textContent=query?(canvases.length?`找到 ${canvases.length} 个已有画布`:'没有匹配的已有画布，请更换关键词'+(can('canvas.create')?'，或选择新建画布。':'。')):`共 ${canvases.length} 个已有画布，可按名称搜索。`;
            if(!can('canvas.edit'))showMessage('当前角色没有编辑权限。',true);
            else if(!initial)showMessage(select.value?'选择目标后点击导入。':'请选择目标画布后导入。');
        };
        const prompt=element('input');prompt.type='checkbox';prompt.id='onlineImportPrompt';prompt.checked=true;
        fields.append(field('搜索已有画布',search),matches,field('目标画布',select),field('同时加入提示词节点',prompt));
        state.select=select;state.prompt=prompt;
        search.addEventListener('input',()=>update());
        search.addEventListener('keydown',event=>{if(event.key==='Enter' && !event.isComposing){event.preventDefault();select.focus();}});
        select.addEventListener('change',()=>{state.createdTarget=null;submit.disabled=!select.value || !can('canvas.edit');showMessage('已有画布正被编辑时，请更换目标或结束编辑后重试。');});
        update(true);
        if(submit.disabled && can('canvas.edit'))showMessage('没有可导入的画布。',true);
    }
    function refreshLibraryFields(){
        const {fields,submit}=dialog.ui;fields.replaceChildren();
        const libraries=state.libraries.filter(lib=>(lib.categories || []).some(cat=>cat.type==='image'));
        const select=element('select');select.id='onlineImportLibrary';
        for(const lib of libraries)select.append(option(lib.id,lib.name || '素材库'));
        const category=element('select');category.id='onlineImportCategory';
        const update=()=>{category.replaceChildren();for(const cat of libraries.find(lib=>lib.id===select.value)?.categories || [])if(cat.type==='image')category.append(option(cat.id,cat.name || '图片分组'));submit.disabled=!category.options.length || !can('asset.manage');};
        select.addEventListener('change',update);update();
        fields.append(field('素材库',select),field('分组',category));state.select=select;state.category=category;
        if(submit.disabled){showMessage(!can('asset.manage')?'当前角色没有保存素材权限。':'暂无可保存的图片分组，请先在素材库创建分组。',true);fields.append(link('打开素材库','/static/asset-manager.html'));}
    }
    async function open(data,destination){
        if(!itemsFor(data).length)return;
        ensureDialog();if(state?.busy)return;
        const seq=++opening;
        state={data:JSON.parse(JSON.stringify(data)),destination,busy:false};
        dialog.ui.fields.inert=false;dialog.ui.fields.replaceChildren();dialog.ui.title.textContent=destination==='canvas'?'加入画布':'保存到素材库';
        const entries=entriesFor(data);
        dialog.ui.summary.textContent=`本次${entries.length>1?` ${entries.length} 条作品，`:''} ${itemsFor(data).length} 张图片${destination==='canvas'?'；分别保留原图和提示词，无需重新生成。':'；选择图片分组，一次保存整批作品。'}`;
        dialog.ui.submit.disabled=true;dialog.ui.submit.hidden=false;dialog.ui.close.disabled=false;showMessage('正在加载可用目标…');
        if(!dialog.open)dialog.showModal();
        try{
            const session=root.CanvasSession;if(session?.ready)await session.ready;
            if(!session?.context || session.paused)throw new Error('请在已登录的工作空间中导入。');
            const result=await getClient().json(destination==='canvas'?'/api/canvases':'/api/asset-library');
            if(seq!==opening || !state)return;
            if(destination==='canvas'){state.canvases=(result.canvases || []).filter(canvas=>!canvas.deleted_at);refreshCanvasFields();}
            else{state.libraries=result.library?.libraries || [];refreshLibraryFields();}
            if(!dialog.ui.submit.disabled)showMessage('选择目标后点击导入。');
        }catch(error){if(seq===opening && state){
            showMessage(error.message,true);
            const retry=element('button','重新加载目标','online-import-close');retry.type='button';retry.addEventListener('click',()=>void open(data,destination));dialog.ui.fields.append(retry);
        }}
    }
    async function perform(){
        if(!state || state.busy || dialog.ui.submit.disabled)return;
        state.busy=true;dialog.ui.submit.disabled=true;dialog.ui.close.disabled=true;dialog.ui.fields.inert=true;showMessage('正在导入，请稍候…');
        try{
            const targetState=state;
            let result;
            if(state.destination==='canvas'){
                const selected=state.select.value;
                const target=state.createdTarget || (selected.startsWith('new:')?{kind:selected.slice(4)}:{id:selected});
                target.includePrompt=state.prompt.checked;state.createdTarget=target;
                result=await getClient().toCanvas(state.data,target);
                const canvas=result.canvas;showMessage(result.notice || (result.added?'作品已加入画布并保存。':'这批作品已经在该画布中，无需重复导入。'));
                dialog.ui.fields.replaceChildren(link('打开画布',`/static/${canvas.kind==='smart'?'smart-canvas':'canvas'}.html?id=${encodeURIComponent(canvas.id)}`));
            }else{
                result=await getClient().toLibrary(state.data,{library_id:state.select.value,category_id:state.category.value});
                showMessage(result.notice || `已保存 ${result.count} 张图片到素材库。`);
                dialog.ui.fields.replaceChildren(link('打开素材库','/static/asset-manager.html'));
            }
            root.dispatchEvent(new CustomEvent('online-import-complete',{detail:{destination:state.destination,data:state.data,result}}));
            if(state===targetState)dialog.ui.submit.hidden=true;
        }catch(error){showMessage(error.message,true);dialog.ui.submit.disabled=false;}
        finally{if(state){state.busy=false;dialog.ui.close.disabled=false;dialog.ui.fields.inert=false;}}
    }
    api.open=open;
    api.bulkActions=function(){
        const selected=cards=>cards.map(card=>cardResults.get(card)?.()).filter(data=>entriesFor(data).length);
        return [['canvas','加入画布'],['library','保存到素材库']].map(([destination,label])=>({
            id:'online-'+destination,label,enabled:cards=>selected(cards).length===cards.length,
            run:cards=>void open(selected(cards),destination)
        }));
    };
    api.attach=function(host,getData,variant=''){
        if(!host || host.dataset.onlineImports)return;host.dataset.onlineImports='1';
        if(variant==='card')cardResults.set(host,getData);
        const actions=element('div',undefined,'online-import-actions '+variant);
        for(const [destination,label,icon] of [['canvas','加入画布','layout-grid'],['library','保存到素材库','archive']]){
            const button=element('button');button.type='button';button.dataset.onlineImport=destination;
            button.innerHTML=`<i data-lucide="${icon}"></i>`;button.append(element('span',label));
            button.addEventListener('click',event=>{event.preventDefault();event.stopPropagation();if(document.body.classList.contains('history-bulk-selecting'))return;void open(getData(),destination);});actions.append(button);
        }
        host.append(actions);root.lucide?.createIcons();
    };
})(typeof window==='object'?window:globalThis);
