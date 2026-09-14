/* Shared member-mode controls for the classic and smart canvases. */
(() => {
    'use strict';
    if (!window.CanvasSession?.enabled) return;
    let active = null, timer = null, draftTimer = null;
    const controlState=new WeakMap();
    const page = crypto.randomUUID();
    const db = new Promise((resolve,reject) => {
        const request = indexedDB.open('canvas-member-drafts',1);
        request.onupgradeneeded = () => request.result.createObjectStore('drafts',{keyPath:'key'});
        request.onsuccess = () => {request.result.onversionchange=() => request.result.close();resolve(request.result);};
        request.onerror = () => reject(request.error);
        request.onblocked = () => reject(new Error('请关闭其他旧页面后重试本地草稿，或先导出当前草稿。'));
    });
    db.catch(() => {});
    async function storage(mode, operation) {
        const database = await db;
        return new Promise((resolve,reject) => {
            const transaction = database.transaction('drafts',mode);
            const request = operation(transaction.objectStore('drafts'));
            transaction.oncomplete = () => resolve(request.result);
            transaction.onerror = () => reject(transaction.error);
            transaction.onabort = () => reject(transaction.error || new Error('草稿未写入'));
        });
    }
    const element = (tag,text) => { const node=document.createElement(tag); if(text !== undefined) node.textContent=text; return node; };
    function button(text, action) {
        const node=element('button',text); node.type='button';
        node.onclick=async () => { node.disabled=true; try { await action(); } catch(error) { if(active) { active.feedback=error.message; render(); } } finally { node.disabled=false; render(); } };
        return node;
    }
    function draftRecord(entry) {
        const context=window.CanvasSession.context;
        return {key:JSON.stringify([context.member.id,context.workspace.id,entry.id,page]), member_id:context.member.id,
            workspace_id:context.workspace.id,canvas_id:entry.id,page,base_revision:entry.lease.revision ?? entry.options.snapshot()?.revision,
            saved_at:new Date().toISOString(),document:entry.options.snapshot()};
    }
    function persist(entry=active) {
        if (!entry || !entry.options.dirty()) return Promise.resolve();
        const record=draftRecord(entry);
        // Store only documents and scope IDs; lease tokens never enter browser storage.
        entry.draftTail=(entry.draftTail || Promise.resolve()).catch(() => {}).then(() => storage('readwrite',store => store.put(record)));
        return entry.draftTail.then(() => { entry.draftMessage='本页更改已暂存为本地草稿'; if(entry===active) render(); }, () => {
            entry.draftMessage='本地草稿暂存失败，请立即导出'; if(entry===active) render();
        });
    }
    function download(record) {
        const href=URL.createObjectURL(new Blob([JSON.stringify(record,null,2)],{type:'application/json'}));
        const link=element('a'); link.href=href; link.download=`canvas-draft-${record.canvas_id}-${Date.now()}.json`; link.click();
        setTimeout(() => URL.revokeObjectURL(href),1000);
    }
    async function showDrafts() {
        const entry=active, context=window.CanvasSession.context;
        const prefix=JSON.stringify([context.member.id,context.workspace.id,entry.id]).slice(0,-1)+',';
        const rows=await storage('readonly',store => store.getAll(IDBKeyRange.bound(prefix,prefix+'\uffff')));
        const dialog=element('dialog'); dialog.className='member-canvas-drafts';
        dialog.append(element('h2','本地草稿'),element('p','这里只显示当前成员、空间和画布的草稿。草稿不会自动覆盖服务器。'));
        const own=rows.filter(row => row.member_id===context.member.id && row.workspace_id===context.workspace.id && row.canvas_id===entry.id);
        if(!own.length) dialog.append(element('p','暂无本地草稿。'));
        for(const row of own.sort((a,b) => b.saved_at.localeCompare(a.saved_at))) {
            const line=element('p',`${new Date(row.saved_at).toLocaleString()} · 基于版本 ${row.base_revision ?? '未知'} `);
            line.append(button('导出',() => download(row))); dialog.append(line);
        }
        dialog.append(button('关闭',() => {dialog.close();dialog.remove();})); document.body.append(dialog); dialog.showModal();
    }
    function confirmAction(title,message,label) {
        return new Promise(resolve => {
            const dialog=element('dialog'); dialog.className='member-canvas-drafts'; dialog.setAttribute('aria-label',title);
            const finish=value => {dialog.close();dialog.remove();resolve(value);};
            dialog.append(element('h2',title),element('p',message),button('取消',() => finish(false)),button(label,() => finish(true)));
            dialog.addEventListener('cancel',event => {event.preventDefault();finish(false);});
            document.body.append(dialog);dialog.showModal();
        });
    }
    function takeoverReason() {
        return new Promise(resolve => {
            const dialog=element('dialog'); dialog.className='member-canvas-drafts'; dialog.setAttribute('aria-label','管理员强制接管');
            const reason=element('textarea'); reason.maxLength=1000; reason.setAttribute('aria-label','接管原因');
            const error=element('p'); error.setAttribute('role','alert');
            const finish=value => {dialog.close();dialog.remove();resolve(value);};
            dialog.append(element('h2','管理员强制接管'),element('p','接管会立即使原页面停止编辑，服务器只能保留已提交的版本。请填写原因，操作将记入审计。'),reason,error,
                button('取消',() => finish(null)),button('确认强制接管',() => {
                    if(!reason.value.trim()) {error.textContent='请填写接管原因。';return;}
                    finish(reason.value.trim());
                }));
            dialog.addEventListener('cancel',event => {event.preventDefault();finish(null);});
            document.body.append(dialog);dialog.showModal();
        });
    }
    function renderRequests(entry) {
        const rows=entry.lease.canSave ? entry.lease.requests.filter(row => row.status==='pending' && row.generation===entry.lease.generation) : [];
        const ids=new Set(rows.map(row => row.id));
        for(const [id,node] of entry.requestNodes) if(!ids.has(id)){node.remove();entry.requestNodes.delete(id);}
        for(const row of rows) {
            let node=entry.requestNodes.get(row.id);
            if(!node) {
                node=element('div'); node.className='member-canvas-transfer-row';
                node.append(element('span',`${row.display_name || '成员'} 申请接手`),
                    button('保存并交接',async () => {
                        if(!await confirmAction('保存并交接',`保存当前更改后，将编辑资格交给 ${row.display_name || '申请人'}。`,'确认保存并交接')) return;
                        if(entry!==active) return;
                        if(!await entry.lease.resolveTransfer(row.id,{approve:true,confirm:true},entry.options.flush)) throw new Error('保存或交接尚未完成，请保留当前内容。');
                    }),button('拒绝申请',async () => {
                        if(entry!==active) return;
                        await entry.lease.resolveTransfer(row.id,{approve:false},entry.options.flush);
                    }));
                entry.requestNodes.set(row.id,node);entry.requestList.append(node);
            }
            for(const action of node.querySelectorAll('button')) action.disabled=entry.lease.finishing || !entry.lease.canSave || (action.textContent==='保存并交接' && !entry.lease.canEdit);
        }
        entry.requestList.hidden=rows.length===0;
    }
    function render() {
        if(!active) return;
        const {lease,options,bar,label,begin,end,save,notice}=active;
        const editable=lease.canEdit;
        document.body.classList.toggle('member-canvas-view',!editable);
        document.querySelectorAll('#nodes input,#nodes textarea,.image-node input,.image-node textarea,.composer input,.composer textarea,.composer [contenteditable]').forEach(node => {
            if(!editable) {
                if(!controlState.has(node)) controlState.set(node,{readOnly:node.readOnly,editable:node.getAttribute('contenteditable')});
                if('readOnly' in node) node.readOnly=true;
                if(node.hasAttribute('contenteditable')) node.setAttribute('contenteditable','false');
            } else if(controlState.has(node)) {
                const original=controlState.get(node);
                if('readOnly' in node) node.readOnly=original.readOnly;
                if(original.editable !== null) node.setAttribute('contenteditable',original.editable);
                controlState.delete(node);
            }
        });
        document.querySelectorAll('#quickToolbar button[onclick^="add"],#quickToolbar button[onclick^="groupSelected"]').forEach(node => {node.disabled=!editable;});
        options.changed?.(lease);
        const holder=lease.status?.holder;
        label.textContent=lease.canSave ? (lease.maintenance==='draining' ? '准备维护 · 请完成保存' : '你正在编辑')
            : holder ? `${holder.display_name || '成员'} 正在编辑${holder.is_self ? '（你的其他页面）' : ''}` : '查看模式';
        const editableRole=window.CanvasSession.context.workspace.permissions?.includes('canvas.edit');
        const cannotStart=!editableRole || ['starting','requesting','waiting'].includes(lease.state) || window.CanvasSession.paused || !['normal','scheduled'].includes(lease.maintenance);
        begin.hidden=lease.canSave || Boolean(holder && !holder.is_self); begin.disabled=cannotStart;
        begin.textContent=holder?.is_self ? '接管到本页' : '开始编辑';
        active.ask.hidden=lease.canSave || !holder || holder.is_self; active.ask.disabled=cannotStart;
        active.ask.textContent=lease.pending ? '等待交接' : '申请接手';
        active.force.hidden=lease.canSave || !holder || holder.is_self || !window.CanvasSession.context.workspace.permissions?.includes('canvas.lock.takeover');
        active.force.disabled=cannotStart;
        end.hidden=!lease.canSave; end.disabled=lease.finishing;
        save.hidden=!lease.canSave; save.disabled=lease.finishing;
        notice.textContent=[...new Set([lease.message,active.feedback,options.dirty() ? active.draftMessage || '当前更改尚未保存到服务器' : ''].filter(Boolean))].join(' · ');
        renderRequests(active);
        bar.hidden=false;
    }
    async function start() {
        const entry=active;
        entry.feedback='';
        if(entry.options.dirty()) {
            await persist(entry);
            // Explicit export before reloading prevents mistaking an unacknowledged save for success.
            download(draftRecord(entry));
            if(!await confirmAction('重新开始编辑','已导出当前草稿。继续将重新载入服务器版本。','重新载入并编辑')) return;
        }
        let options={};
        if(entry.lease.status?.holder?.is_self) {
            if(!await confirmAction('接管编辑','接管到本页后，你的其他页面将停止编辑。请先确认其他页面的更改已保存或导出。','确认接管到本页')) return;
            options={takeover:'self',expected_generation:entry.lease.status.generation,confirm:true};
        }
        await entry.lease.start(entry.options.reload,options);
    }
    async function askTransfer() {
        const entry=active;
        if(entry.options.dirty()) {
            await persist(entry);download(draftRecord(entry));
            if(!await confirmAction('申请接手','已导出当前草稿。申请前会重新载入服务器版本。','重新载入并申请')) return;
            if(!await entry.options.reload()) throw new Error('重载失败，请重试。');
        }
        entry.feedback=''; await entry.lease.requestTransfer();
    }
    async function forceTakeover() {
        const entry=active, generation=entry.lease.status?.generation;
        if(entry.options.dirty()) {await persist(entry);download(draftRecord(entry));}
        const reason=await takeoverReason();
        if(reason===null || entry!==active) return;
        entry.feedback='';
        await entry.lease.start(entry.options.reload,{takeover:'force',expected_generation:generation,confirm:true,reason});
    }
    async function tick(entry) {
        if(entry!==active) return;
        try {
            if(entry.lease.canSave) await entry.lease.renew();
            await entry.lease.refreshTransfers(async () => {
                if(entry.options.dirty()) {await persist(entry);throw new Error('交接已批准，但本页有未保存内容，请先导出草稿再接管。');}
                return entry.options.reload();
            });
        }
        catch(error) { entry.feedback=error.message; render(); }
        if(entry===active) timer=setTimeout(() => tick(entry),Math.min(5000,(entry.lease.status?.heartbeat_seconds || 5)*1000));
    }
    const api={
        get active(){return active;},
        get canEdit(){return Boolean(active?.lease.canEdit);},
        get canSave(){return Boolean(active?.lease.canSave);},
        get canRefresh(){return active?.lease.state==='view' && !active.options.dirty();},
        async mount(options) {
            if(active?.id===options.id) return active;
            if(active) throw new Error('请先保存并结束当前画布编辑。');
            const bar=element('section'); bar.className='member-canvas-edit'; bar.setAttribute('aria-label','画布编辑权限');
            const label=element('strong'), notice=element('span'); notice.className='member-canvas-edit-notice'; notice.setAttribute('role','status');
            const begin=button('开始编辑',start), save=button('保存',async () => {
                if(!await options.flush()) throw new Error('保存尚未完成，请保留草稿。');
            }), end=button('保存并结束',async () => {
                if(!await active.lease.finish(options.flush)) throw new Error('更改尚未保存，仍保留在当前页面。');
            });
            const ask=button('申请接手',askTransfer), force=button('管理员强制接管',forceTakeover), requestList=element('div');
            requestList.className='member-canvas-transfer-list';requestList.setAttribute('aria-label','待处理接手申请');
            active={id:options.id,options,bar,label,notice,begin,save,end,ask,force,requestList,requestNodes:new Map()};
            const entry=active;
            entry.lease=new window.CanvasEditLease({id:options.id,changed:lease => {
                if(entry!==active) return;
                if(lease.state==='paused') persist(entry);
                render();
            }});
            const maintenance=window.CanvasSession.maintenance || window.parent?.CanvasSession?.maintenance;
            if(maintenance) entry.lease.setMaintenance(maintenance.mode);
            bar.append(label,begin,ask,force,save,end,button('导出当前草稿',() => download(draftRecord(entry))),button('本地草稿',showDrafts),notice,requestList);
            document.body.append(bar); render(); tick(entry);
            return entry;
        },
        markDirty() { clearTimeout(draftTimer); const entry=active; draftTimer=setTimeout(() => persist(entry),150); },
        async leave() {
            const entry=active;
            if(!entry) return true;
            if(entry.lease.canSave) { if(!await entry.lease.finish(entry.options.flush)) return false; }
            else if(entry.options.dirty()) { await persist(entry); entry.feedback='请先导出草稿；未保存的页面不会自动关闭。'; render(); return false; }
            clearTimeout(timer); clearTimeout(draftTimer); entry.lease.dispose(); entry.bar.remove(); active=null;
            document.body.classList.remove('member-canvas-view'); return true;
        },
        send(path,init={},transport=window.fetch.bind(window)) {
            const url=new URL(path,location.href), match=url.pathname.match(/^\/api\/canvases\/([^/]+)(.*)$/);
            if(url.origin===location.origin && /^\/api\/canvas-(image|video)-tasks$/.test(url.pathname) && init.method?.toUpperCase()==='POST') {
                const id=JSON.parse(init.body || '{}').canvas_id;
                if(id) {
                    if(!active || id!==active.id) return Promise.reject(new Error('生成任务与当前编辑画布不一致。'));
                    return active.lease.write(path,init,transport);
                }
            }
            if(url.origin===location.origin && match && !['GET','HEAD'].includes((init.method || 'GET').toUpperCase()) && !match[2].startsWith('/edit-lease') && match[2]!=='/touch') {
                if(!active || decodeURIComponent(match[1])!==active.id) return Promise.reject(new Error('请先打开画布并开始编辑。'));
                return active.lease.write(path,init,transport);
            }
            return transport(path,init);
        }
    };
    window.MemberCanvasEdit=api;
    // Block keyboard/paste/drop paths too; pointer-events alone does not prevent typing.
    for(const type of ['beforeinput','paste','cut','drop','keydown']) window.addEventListener(type,event => {
        if(!active || active.lease.canEdit || event.target.closest?.('.member-canvas-edit,.member-canvas-drafts,.member-session-panel')) return;
        const target=event.target.closest?.('#nodes,.image-node,.composer,.create-menu');
        const key=String(event.key || '').toLowerCase();
        const command=type==='keydown' && ((event.ctrlKey || event.metaKey) && ['v','x','z','y','g'].includes(key) || ['delete','backspace'].includes(key));
        if((target && type!=='keydown') || command || type==='drop') {event.preventDefault();event.stopImmediatePropagation();}
    },true);
    window.addEventListener('member-session:paused',event => active?.lease.pause(event.detail?.message));
    window.addEventListener('member-session:maintenance',event => active?.lease.setMaintenance(event.detail.mode));
    window.addEventListener('pagehide',() => { persist(); active?.lease.dispose(); clearTimeout(timer); });
    // A transport disconnect must not release a lease or erase local work.
    window.addEventListener('offline',() => active?.lease.pause('网络已断开，已停止编辑，请保留草稿。'));
})();
