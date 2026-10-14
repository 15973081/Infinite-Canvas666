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
        request.onblocked = () => reject(new Error('请关闭其他旧页面后重试草稿暂存。当前页面请保持打开。'));
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
        const document=JSON.parse(JSON.stringify(entry.options.snapshot()));
        return {key:JSON.stringify([entry.memberId,entry.workspaceId,entry.id,page]), member_id:entry.memberId,
            workspace_id:entry.workspaceId,canvas_id:entry.id,page,base_revision:entry.lease.revision ?? document.revision,
            base_generation:entry.lease.generation,record_id:crypto.randomUUID(),saved_at:new Date().toISOString(),document};
    }
    function persist(entry=active) {
        if (!entry || !entry.options.dirty()) return Promise.resolve();
        const record=draftRecord(entry);
        // Store only documents and scope IDs; lease tokens never enter browser storage.
        entry.draftTail=(entry.draftTail || Promise.resolve()).catch(() => {}).then(() => storage('readwrite',store => store.put(record)));
        return entry.draftTail.then(() => { entry.draftMessage='本页更改已暂存为自动草稿'; if(entry===active) render(); }, () => {
            entry.draftMessage='草稿暂存失败，请保持页面打开并重试'; if(entry===active) render();
        });
    }
    async function reportPage(entry=active, closed=false) {
        if(!entry || entry.reportClosed) return false;
        const context=window.CanvasSession.context;
        if(window.CanvasSession.paused || context?.member.id!==entry.memberId || context?.workspace.id!==entry.workspaceId) return false;
        if(closed) {entry.reportClosed=true;clearTimeout(entry.reportTimer);}
        const sequence=++entry.reportSequence;
        try {
            const response=await fetch(`/api/canvases/${encodeURIComponent(entry.id)}/page-state`, {
                method:'POST',credentials:'same-origin',keepalive:closed,signal:AbortSignal.timeout(5000),
                headers:{'Content-Type':'application/json','X-Workspace-ID':entry.workspaceId,'X-Member-ID':entry.memberId},
                body:JSON.stringify({page_id:entry.reportId,sequence,dirty:Boolean(entry.options.dirty()),closed})
            });
            if(!response.ok) throw new Error('维护页面状态暂未上报，后台可能显示本页失联。');
            const data=await response.json();
            if(sequence===entry.reportSequence && entry===active && !closed && !window.CanvasSession.paused &&
                window.CanvasSession.context?.member.id===entry.memberId && window.CanvasSession.context?.workspace.id===entry.workspaceId) {
                entry.reportMessage='';
                entry.presence=Array.isArray(data.presence?.members) ? data.presence : null;
                entry.presenceReceivedAt=Date.now();
            }
            return true;
        } catch(error) {
            if(sequence===entry.reportSequence) {entry.presence=null;entry.reportMessage='维护页面状态暂未上报，后台可能显示本页失联。';}
            return false;
        } finally {if(entry===active && !closed) render();}
    }
    async function reportTick(entry) {
        if(entry!==active || entry.reportClosed || entry.reportSuspended) return;
        await reportPage(entry);
        // Keep within the server's 35-second presence expiry, including hidden pages.
        if(entry===active && !entry.reportClosed && !entry.reportSuspended) entry.reportTimer=setTimeout(() => reportTick(entry),20000);
    }
    async function preserveDraft(entry) {
        assertDraftScope(entry);
        if(!entry.options.dirty()) return;
        const record=draftRecord(entry);
        // A separate checkpoint survives future edits to this page's live draft.
        record.page=page+'/restored/'+crypto.randomUUID();
        record.key=JSON.stringify([entry.memberId,entry.workspaceId,entry.id,record.page]);
        try {
            await entry.draftTail;
            assertDraftScope(entry);
            await storage('readwrite',store => store.put(record));
            assertDraftScope(entry);
        } catch(error) {
            throw new Error('草稿暂存未完成，已保留当前页面。请稍后重试，不要刷新或关闭。');
        }
    }
    async function showDrafts() {
        const entry=active;
        assertDraftScope(entry);
        // Include the latest typing even when the 150 ms draft timer has not fired.
        if(entry.options.dirty()) await persist(entry);
        const prefix=JSON.stringify([entry.memberId,entry.workspaceId,entry.id]).slice(0,-1)+',';
        const rows=await storage('readonly',store => store.getAll(IDBKeyRange.bound(prefix,prefix+'\uffff')));
        assertDraftScope(entry);
        const dialog=element('dialog'); dialog.className='member-canvas-drafts';
        dialog.append(element('h2','自动草稿'),element('p','这里只显示当前成员、空间和画布的草稿。先开始编辑，才能恢复同版本草稿。版本不同可另存副本。草稿保存在当前浏览器，未同步到云端。恢复不会立即提交到服务器；副本会创建新画布，均不会重启生成任务。'));
        const own=rows.filter(row => ownsDraft(entry,row));
        if(!own.length) dialog.append(element('p','暂无自动草稿。'));
        for(const row of own.sort((a,b) => b.saved_at.localeCompare(a.saved_at))) {
            const origin=row.copy_request_id ? '副本请求' : row.page===page ? '本页' : row.page.includes('/restored/') ? '恢复前留存' : '其他页面';
            const line=element('p',`${new Date(row.saved_at).toLocaleString()} · 基于版本 ${row.base_revision ?? '未知'} · ${origin} `);
            const error=element('span'); error.setAttribute('role','status');
            const action=fn => async () => {try {assertDraftScope(entry,row);await fn();} catch(e) {error.textContent=e.message;}};
            let copyResult=row.copy_result;
            const openCopy=button('打开副本',action(async () => {
                if(!copyResult || !entry.options.openCopy) return;
                if(!await api.leave()) return;
                dialog.close();dialog.remove();await entry.options.openCopy(copyResult);
            }));
            openCopy.hidden=!copyResult;
            if(copyResult) error.textContent='已创建副本：'+copyResult.title;
            const copyButton=button(row.copy_request_id ? '重试 / 确认副本' : '另存副本',action(async () => {
                if(!await confirmAction('另存草稿副本','将在当前空间创建新画布，保留节点、连线和素材，不复制费用日志或重启任务。原画布和草稿会保留。重复确认同一请求会返回同一个副本。','确认另存副本')) return;
                copyResult=await copyDraft(entry,row);openCopy.hidden=false;
                error.textContent='已创建副本：'+copyResult.title;
            }));
            copyButton.disabled=!['canvas.create','canvas.read','asset.read'].every(p => window.CanvasSession.context.workspace.permissions?.includes(p));
            line.append(button('恢复到本页',action(async () => {
                if(!entry.lease.canEdit) throw new Error('请先关闭此窗口并开始编辑，再打开草稿恢复。');
                if(!entry.options.restore || entry.options.busy?.()) throw new Error('请等待当前保存或生成结束后再恢复。');
                if(!await confirmAction('恢复自动草稿','恢复将替换本页内容；当前未保存内容会先自动留存。服务器版本必须与草稿一致，恢复后请检查并保存。','确认恢复到本页')) return;
                assertDraftScope(entry,row);
                if(!row.document || row.document.id!==entry.id || (row.document.kind || 'classic')!==(entry.options.snapshot().kind || 'classic')) throw new Error('草稿画布类型或身份不匹配，不能恢复。');
                if(row.page===page) {
                    const archive={...row,page:page+'/restored/'+crypto.randomUUID()};
                    archive.key=JSON.stringify([entry.memberId,entry.workspaceId,entry.id,archive.page]);
                    await storage('readwrite',store => store.put(archive));
                }
                if(entry.options.dirty()) await preserveDraft(entry);
                await entry.lease.restoreDraft(row.base_revision,() => {
                    assertDraftScope(entry,row);
                    if(entry.options.busy?.()) throw new Error('当前保存或生成尚未结束，请稍后恢复。');
                    entry.options.restore(JSON.parse(JSON.stringify(row.document)));
                });
                await persist(entry);entry.feedback='草稿已恢复到本页，请检查后保存。原草稿仍保留在列表中。';
                dialog.close();dialog.remove();
            })),button('删除草稿',action(async () => {
                if(row.page===page && entry.options.dirty()) throw new Error('本页还有未保存内容，请先保存或保留草稿并离开，再清理这份草稿。');
                if(!await confirmAction('删除自动草稿','这只删除此条自动草稿，无法撤销。需要保留时请取消，或先另存副本。','确认删除草稿')) return;
                await deleteDraft(entry,row);line.remove();
            })),copyButton,openCopy,error); dialog.append(line);
        }
        dialog.append(button('关闭',() => {dialog.close();dialog.remove();})); document.body.append(dialog); dialog.showModal();
    }
    async function showTaskResults() {
        const entry=active;
        assertDraftScope(entry);
        const dialog=element('dialog');dialog.className='member-canvas-drafts';dialog.setAttribute('aria-label','生成结果');
        const list=element('div'),status=element('p');status.setAttribute('role','status');
        let after='',loading=false;
        const load=async (reset=false) => {
            if(loading)return;
            loading=true;status.textContent='正在读取结果…';
            try {
                assertDraftScope(entry);
                const cursor=reset?'':after;
                const response=await fetch('/api/canvases/'+encodeURIComponent(entry.id)+'/task-results'+(cursor?'?after='+encodeURIComponent(cursor):''),{cache:'no-store'});
                const data=await response.json();assertDraftScope(entry);
                if(!dialog.isConnected)return;
                if(!response.ok)throw new Error('结果列表暂不可用，请检查当前空间的任务与素材读取权限。');
                if(reset)list.replaceChildren();
                after=data.next_after || '';
                for(const row of data.results) {
                    const card=element('section'),line=element('p',(row.model || (row.kind==='llm'?'对话':row.kind==='video'?'视频':row.kind==='audio'?'音频':'图片'))+' · '+row.id);
                    const state=element('p',row.state==='in_canvas'?'已在画布中':row.state==='ready'?'结果已保存 · '+row.outputs.length+(row.kind==='llm'?' 条回复':' 个素材'):'结果素材待核对');
                    const add=button('加入为新结果节点',async () => {
                        try {
                            assertDraftScope(entry);
                            await entry.lease.joinResult(row.id,entry.options.flush,entry.options.reload,()=>validEntry(entry));
                            assertDraftScope(entry);status.textContent='结果已加入并保存。';await load(true);
                        } catch(error) {status.textContent=error.message;}
                    });
                    add.disabled=row.state!=='ready'||!entry.lease.canEdit;
                    card.className='member-canvas-result-row';card.append(line,state);
                    if(row.state==='ready' && ['changed','missing'].includes(row.binding?.state)){
                        card.append(element('p',row.binding.state==='missing'?'原节点已删除或不可用，结果仍可独立加入。':'原输入已修改，加入结果时会保留当前内容。'));
                    }
                    card.append(add);list.append(card);
                }
                more.hidden=!after;status.textContent=list.children.length?'':'暂无已完成的图片、视频或对话结果。';
            } catch(error) {status.textContent=error.message;}
            finally {loading=false;}
        };
        const more=button('加载更多结果',()=>load());more.hidden=true;
        dialog.append(element('h2','生成结果'),element('p','结果由服务器独立保存。开始编辑后可加入为新节点，原节点和其他更改会保留；此操作不会重新生成或产生新的费用。'),
            button('刷新结果',()=>load(true)),list,more,status,button('关闭',()=>{dialog.close();dialog.remove();}));
        document.body.append(dialog);dialog.showModal();await load(true);
    }
    function ownsDraft(entry,row) {
        return row && row.member_id===entry.memberId && row.workspace_id===entry.workspaceId && row.canvas_id===entry.id &&
            typeof row.page==='string' && row.key===JSON.stringify([entry.memberId,entry.workspaceId,entry.id,row.page]);
    }
    async function copyDraft(entry,row) {
        assertDraftScope(entry,row);
        if(window.CanvasSession.paused || !['normal','scheduled'].includes(entry.lease.maintenance)) throw new Error('会话暂停或维护期间不能新建副本，请保留草稿。');
        if(!['canvas.create','canvas.read','asset.read'].every(p => window.CanvasSession.context.workspace.permissions?.includes(p))) throw new Error('当前角色没有创建副本或读取素材的权限。');
        const source=row.document;
        if(!source || source.id!==entry.id || (source.kind || 'classic')!==(entry.options.snapshot().kind || 'classic')) throw new Error('草稿身份或类型不匹配，请保留当前草稿。');
        const document={title:source.title || '未命名画布',icon:source.icon || (source.kind==='smart' ? 'sparkles' : '🧩'),kind:source.kind || 'classic',
            nodes:source.nodes,connections:source.connections || [],settings:source.settings || {},viewport:source.viewport || {}};
        // A content-derived ID survives reloads and concurrent tabs even if the
        // network response is lost. Scope and the selected source record are bound.
        const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify([row.key,document])));
        const hex=Array.from(new Uint8Array(bytes),b => b.toString(16).padStart(2,'0')).join('').slice(0,32);
        const requestId=row.copy_request_id || [hex.slice(0,8),hex.slice(8,12),hex.slice(12,16),hex.slice(16,20),hex.slice(20)].join('-');
        const attempt={...row,copy_request_id:requestId,page:row.copy_request_id ? row.page : row.page+'/copy/'+requestId};
        attempt.key=JSON.stringify([entry.memberId,entry.workspaceId,entry.id,attempt.page]);
        assertDraftScope(entry,row);
        // Freeze a separate retry record before submitting; the live page may
        // keep updating its own draft without erasing this attempt.
        await storage('readwrite',store => store.put(attempt));
        assertDraftScope(entry,row);
        const response=await window.fetch('/api/canvas-draft-copies',{method:'POST',headers:{'Content-Type':'application/json'},
            body:JSON.stringify({request_id:requestId,document}),signal:AbortSignal.timeout(30000)});
        const data=await response.json();
        assertDraftScope(entry,row);
        if(!response.ok) throw new Error({draft_copy_request_conflict:'同一请求的草稿内容已变化，请保留原稿并重新打开列表。',
            draft_copy_unavailable:'此前创建的副本已在回收站，请先到画布列表恢复；此次不会重复新建。',
            draft_copy_assets_unavailable:'草稿包含当前空间不可用的素材，请保留当前草稿并检查素材。',
            permission_denied:'当前角色没有创建副本的权限。'}[data.detail?.code] || '副本创建未确认，请保留草稿并重试同一请求。');
        if(!data.canvas?.id || data.canvas.id===entry.id || data.canvas.kind!==document.kind || !Number.isSafeInteger(data.canvas.revision)) throw new Error('副本响应不完整，请重试确认。');
        attempt.copy_result=data.canvas;
        await storage('readwrite',store => store.put(attempt));
        return data.canvas;
    }
    function assertDraftScope(entry,row) {
        const context=window.CanvasSession.context;
        if(entry!==active || context.member.id!==entry.memberId || context.workspace.id!==entry.workspaceId || (row && !ownsDraft(entry,row))) throw new Error('页面成员或空间已变化，请重新打开画布。');
    }
    async function deleteDraft(entry,row) {
        await entry.draftTail;
        const database=await db;
        return new Promise((resolve,reject) => {
            const transaction=database.transaction('drafts','readwrite'), store=transaction.objectStore('drafts');
            const request=store.get(row.key); let failure;
            request.onsuccess=() => {
                try {
                    assertDraftScope(entry,row);
                    if(row.page===page && entry.options.dirty()) throw new Error('本页产生了新更改，请先保留草稿。');
                    // Read and compare in the same transaction: another tab may have
                    // replaced this record while the confirmation dialog was open.
                    if(JSON.stringify(request.result)!==JSON.stringify(row)) throw new Error('草稿已变化，请重新打开列表后再清理。');
                    store.delete(row.key);
                } catch(error) {failure=error;transaction.abort();}
            };
            transaction.oncomplete=resolve;
            transaction.onerror=transaction.onabort=() => reject(failure || transaction.error || new Error('草稿未删除'));
        });
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
    function renderPresence(entry) {
        const context=window.CanvasSession.context;
        const fresh=entry.presence && !window.CanvasSession.paused && context?.member.id===entry.memberId &&
            context?.workspace.id===entry.workspaceId && Date.now()-entry.presenceReceivedAt<35000;
        entry.presenceSummary.textContent=fresh ? entry.presence.online_members+' 人在线' : '在线名单暂不可用';
        entry.presenceSummary.setAttribute('data-presence', fresh ? 'fresh' : 'stale');
        entry.presenceList.replaceChildren();
        if(fresh) for(const member of entry.presence.members) {
            const name=String(member.display_name || '成员')+' · '+String(member.id).slice(-6)+(member.is_self ? '（你）' : '');
            entry.presenceList.append(element('li',name+' · '+(member.activity==='editing' ? '编辑中' : '查看中')));
        }
    }
    function render() {
        if(!active) return;
        const {lease,options,bar,label,begin,end,save,notice}=active;
        const previousWidth=bar.getBoundingClientRect?.().width;
        const previousLayoutWidth=active.layout?.getBoundingClientRect?.().width;
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
        notice.textContent=[...new Set([lease.message,active.feedback,active.streamMessage,active.reportMessage,options.dirty() ? active.draftMessage || '当前更改尚未保存到服务器' : ''].filter(Boolean))].join(' · ');
        bar.setAttribute('data-state', lease.canSave ? 'editing' : 'view');
        notice.setAttribute('data-tone', lease.state==='paused' || ['draining','read_only','offline','recovering'].includes(lease.maintenance) || active.feedback || active.streamMessage || active.reportMessage ? 'warning' : 'quiet');
        if(!notice.textContent) notice.textContent=lease.canSave ? '更改已保存' : '查看中 · 开始编辑后可修改';
        notice.title=notice.textContent;
        renderRequests(active);
        renderPresence(active);
        active.mediaPreview?.sync();
        bar.hidden=false;
        const nextLayoutWidth=active.layout?.getBoundingClientRect?.().width;
        // Heartbeats and save notices must not restart an in-flight resize.
        if(Math.abs(nextLayoutWidth-previousLayoutWidth)<1) return;
        active.widthAnimation?.cancel();
        const nextWidth=bar.getBoundingClientRect?.().width;
        if(previousWidth>0 && nextWidth>0 && Math.abs(nextWidth-previousWidth)>1 && bar.animate && !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
            active.widthAnimation=bar.animate([{width:previousWidth+'px'},{width:nextWidth+'px'}],
                {duration:180,easing:'linear'});
        }
    }
    async function start() {
        const entry=active;
        entry.feedback='';
        if(entry.options.dirty()) {
            await persist(entry);
            if(!await confirmAction('保留草稿并开始编辑','本页有未保存的修改。继续将自动留存草稿，再载入服务器版本。可在“自动草稿”中恢复或另存副本。','保留草稿并开始编辑')) return;
            assertDraftScope(entry);
            await preserveDraft(entry);
        }
        let options={};
        if(entry.lease.status?.holder?.is_self) {
            if(!await confirmAction('接管编辑','接管到本页后，你的其他页面将停止编辑。请先确认其他页面的更改已保存或暂存。','确认接管到本页')) return;
            options={takeover:'self',expected_generation:entry.lease.status.generation,confirm:true};
        }
        await entry.lease.start(entry.options.reload,options);
    }
    async function askTransfer() {
        const entry=active;
        if(entry.options.dirty()) {
            await persist(entry);
            if(!await confirmAction('申请接手','本页有未保存的修改。继续将自动留存草稿，再载入服务器版本。可在“自动草稿”中恢复或另存副本。','保留草稿并申请')) return;
            await preserveDraft(entry);
            if(!await entry.options.reload()) throw new Error('重载失败，请重试。');
        }
        entry.feedback=''; await entry.lease.requestTransfer();
    }
    async function forceTakeover() {
        const entry=active, generation=entry.lease.status?.generation;
        if(entry.options.dirty()) await preserveDraft(entry);
        const reason=await takeoverReason();
        if(reason===null || entry!==active) return;
        entry.feedback='';
        await entry.lease.start(entry.options.reload,{takeover:'force',expected_generation:generation,confirm:true,reason});
    }
    function validEntry(entry) {
        const context=window.CanvasSession.context;
        return entry===active && !window.CanvasSession.paused && !entry.reportSuspended &&
            context?.member.id===entry.memberId && context?.workspace.id===entry.workspaceId;
    }
    function refreshState(entry) {
        if(!validEntry(entry)) return Promise.resolve();
        if(entry.refreshing) {entry.refreshAgain=true;return entry.refreshing;}
        entry.refreshing=(async () => {
            do {
                entry.refreshAgain=false;
                await entry.lease.refreshTransfers(async () => {
                    if(!validEntry(entry)) throw new Error('页面身份已变化，请保留草稿。');
                    if(entry.options.dirty()) {await persist(entry);throw new Error('交接已批准，但本页有未保存内容，请点击开始编辑，保留草稿后再接管。');}
                    return entry.options.reload();
                });
                entry.lastStateAt=Date.now();
                if(validEntry(entry) && api.canRefresh && !entry.options.busy?.() && entry.options.refresh &&
                    entry.lease.status?.revision>Number(entry.options.snapshot().revision || 0)) await entry.options.refresh();
            } while(entry.refreshAgain && validEntry(entry));
        })().finally(()=>{entry.refreshing=null;});
        return entry.refreshing;
    }
    function subscribe(entry) {
        if(!window.CanvasSubscription || !entry.options.refresh)return;
        const address=new URL('/ws/canvases/'+encodeURIComponent(entry.id),location.href);
        address.protocol=location.protocol==='https:' ? 'wss:' : 'ws:';
        entry.subscription=new window.CanvasSubscription({id:entry.id,workspace:entry.workspaceId,
            url:window.CanvasSession.socketUrl(address.href),valid:()=>validEntry(entry),
            onChange:async value=>{
                if(!validEntry(entry))return;
                entry.streamMessage='';entry.lease.setMaintenance(value.maintenance.mode);
                if(!['offline','recovering'].includes(value.maintenance.mode))await refreshState(entry);
                entry.refreshTasks?.();
                render();
            },onDisconnect:message=>{
                if(entry!==active)return;
                entry.streamMessage=message;
                if(entry.lease.token || entry.lease.pending || ['starting','requesting'].includes(entry.lease.state))entry.lease.pause(message);
                render();
            }});
        entry.subscription.start();
    }
    async function tick(entry) {
        if(!validEntry(entry)) return;
        if(entry.ticking)return;
        entry.ticking=true;
        try {
            if(entry.lease.canSave) await entry.lease.renew();
            // Real-time hints handle changes. HTTP is a slower fallback; renewals
            // remain independent of visibility so a hidden editor cannot lose its lock.
            if(!document.hidden && (!entry.subscription?.healthy || entry.lease.pending ||
                Date.now()-(entry.lastStateAt || 0)>=60000)) await refreshState(entry);
        }
        catch(error) {if(entry===active){entry.feedback=error.message;render();}}
        finally {entry.ticking=false;}
        const delay=entry.lease.canSave ? Math.max(1000,Math.min(10000,(entry.lease.status?.heartbeat_seconds || 5)*1000)) :
            entry.lease.pending ? 5000 : 15000;
        if(validEntry(entry)) timer=setTimeout(() => tick(entry),delay);
    }
    const api={
        openTaskResults:showTaskResults,
        taskState:task=>active?.taskRecovery?.get(task) || {status:'checking',label:'正在核对后台任务'},
        refreshTasks:()=>active?.taskRecovery?.refresh(),
        get active(){return active;},
        get canEdit(){return Boolean(active?.lease.canEdit);},
        get canSave(){return Boolean(active?.lease.canSave);},
        get canRefresh(){return active?.lease.state==='view' && validEntry(active) && !['offline','recovering'].includes(active.lease.maintenance) && !active.options.dirty();},
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
            const presencePanel=element('details'), presenceSummary=element('summary'), presenceList=element('ul');
            presencePanel.className='member-canvas-presence';presencePanel.setAttribute('aria-label','当前画布在线成员');
            presencePanel.append(presenceSummary,presenceList);
            const context=window.CanvasSession.context;
            active={id:options.id,memberId:context.member.id,workspaceId:context.workspace.id,reportId:crypto.randomUUID(),reportSequence:0,
                options,bar,label,notice,begin,save,end,ask,force,requestList,presencePanel,presenceSummary,presenceList,requestNodes:new Map()};
            const entry=active;
            entry.lease=new window.CanvasEditLease({id:options.id,changed:lease => {
                if(entry!==active) return;
                if(lease.state==='paused') persist(entry);
                render();
            }});
            const maintenance=window.CanvasSession.maintenance || window.parent?.CanvasSession?.maintenance;
            if(maintenance) entry.lease.setMaintenance(maintenance.mode);
            const more=element('details'), moreSummary=element('summary','更多'), moreItems=element('div');
            more.className='member-canvas-more'; moreItems.className='member-canvas-menu';
            moreItems.append(button('自动草稿',() => {more.open=false;return showDrafts();}),
                force);
            more.append(moreSummary,moreItems);
            begin.className=end.className=ask.className='member-canvas-primary';
            const layout=element('div'); layout.className='member-canvas-layout'; entry.layout=layout;
            layout.append(label,begin,ask,save,end,button('生成结果',showTaskResults),more,presencePanel,requestList);
            const statusHost=document.getElementById?.('memberCanvasStatus');
            if(statusHost) {
                notice.className='member-canvas-title-status';
                statusHost.append(notice);
            } else layout.append(notice);
            bar.append(layout);
            entry.mediaPreview=window.MemberMediaPreview?.create({entry,valid:()=>validEntry(entry)});
            if(entry.mediaPreview)layout.insertBefore(entry.mediaPreview.trigger,presencePanel);
            document.body.append(bar); render(); tick(entry); reportTick(entry); subscribe(entry);
            if(options.taskRecovery && window.CanvasTaskResults?.recovery){
                entry.taskRecovery=window.CanvasTaskResults.recovery({...options.taskRecovery,
                    current:()=>active===entry,
                    allowed:()=>validEntry(entry) && !window.CanvasSession.paused &&
                        ['canvas.read','task.read','asset.read'].every(permission=>window.CanvasSession.context?.workspace?.permissions?.includes(permission)),
                    sync:async valid=>{
                        const adapter=options.taskRecovery;
                        if(!adapter.mergeDeliveries || adapter.deliveryBusy())return;
                        const response=await fetch('/api/canvases/'+encodeURIComponent(entry.id)+'/task-results?delivered_after='+adapter.deliveryVersion(),
                            {cache:'no-store',signal:AbortSignal.timeout(10000)});
                        if(!response.ok)throw new Error('画布结果同步失败：'+response.status);
                        const data=await response.json();
                        if(valid() && !adapter.deliveryBusy())adapter.mergeDeliveries(data);
                    },
                    read:async item=>{
                        const response=await fetch('/api/canvas-'+item.kind+'-tasks/'+encodeURIComponent(item.id),{cache:'no-store',signal:AbortSignal.timeout(10000)});
                        if(!response.ok){const error=new Error('任务查询失败');error.status=response.status;throw error;}
                        return response.json();
                    }});
                entry.refreshTasks=()=>entry.taskRecovery.refresh();
                window.addEventListener('online',entry.refreshTasks);
                document.addEventListener('visibilitychange',entry.refreshTasks);
                entry.refreshTasks();
            }
            return entry;
        },
        markDirty() { clearTimeout(draftTimer); const entry=active; draftTimer=setTimeout(() => {persist(entry);reportPage(entry);},150); },
        prepareReload() {
            const entry=active;
            if(!entry) return Promise.resolve(true);
            if(entry.reloadRequest) return entry.reloadRequest;
            entry.reloadRequest=(async () => {
                try {
                    // Snapshot before attempting the final write. A failed or uncertain
                    // save never authorizes navigation or removes the draft.
                    await persist(entry);
                    if(entry!==active) return false;
                    const saved=entry.lease.canSave ? await entry.lease.finish(entry.options.flush) : !entry.options.dirty();
                    await reportPage(entry);
                    return saved;
                } catch(error) {
                    entry.feedback=error.message; render(); return false;
                }
            })().finally(() => {entry.reloadRequest=null;});
            return entry.reloadRequest;
        },
        async leave() {
            const entry=active;
            if(!entry) return true;
            if(entry.lease.canSave) { if(!await entry.lease.finish(entry.options.flush)) return false; }
            else if(entry.options.dirty()) {
                await persist(entry);
                if(!await confirmAction('保留草稿并离开','当前内容尚未保存到服务器。继续将自动留存本页草稿，再离开画布。稍后可在当前浏览器的“自动草稿”中恢复或另存副本。','保留草稿并离开')) return false;
                await preserveDraft(entry);
            }
            reportPage(entry,true);
            entry.taskRecovery?.stop();
            if(entry.refreshTasks){
                window.removeEventListener('online',entry.refreshTasks);
                document.removeEventListener('visibilitychange',entry.refreshTasks);
            }
            clearTimeout(timer); clearTimeout(draftTimer); clearTimeout(entry.reportTimer); entry.subscription?.stop(); entry.lease.dispose(); entry.mediaPreview?.dispose(); entry.widthAnimation?.cancel(); entry.notice.remove(); entry.bar.remove(); active=null;
            document.body.classList.remove('member-canvas-view'); return true;
        },
        send(path,init={},transport=window.fetch.bind(window)) {
            const url=new URL(path,location.href), match=url.pathname.match(/^\/api\/canvases\/([^/]+)(.*)$/);
            if(url.origin===location.origin && /^\/api\/canvas-(image|video|llm|audio)-tasks$/.test(url.pathname) && init.method?.toUpperCase()==='POST') {
                const id=JSON.parse(init.body || '{}').canvas_id;
                if(id) {
                    if(!active || id!==active.id) return Promise.reject(new Error('生成任务与当前编辑画布不一致。'));
                    return active.lease.write(path,init,transport);
                }
            }
            const directoryId=window.CanvasDirectoryWrites.matches(path,init);
            if(directoryId)return window.CanvasDirectoryWrites.write(directoryId,path,init,transport,active?.lease);
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
    window.addEventListener('member-session:paused',event => {active?.subscription?.stop();active?.lease.pause(event.detail?.message);});
    window.addEventListener('member-session:maintenance',event => active?.lease.setMaintenance(event.detail.mode));
    window.addEventListener('pagehide',event => {
        persist();
        if(active){active.mediaPreview?.close();active.subscription?.stop();active.reportSuspended=true;clearTimeout(active.reportTimer);}
        reportPage(active,!event.persisted);
        if(event.persisted) active?.lease.pause('页面已暂停，请保留草稿并重新确认编辑资格。');
        else active?.lease.dispose();
        clearTimeout(timer);clearTimeout(draftTimer);
    });
    window.addEventListener('pageshow',event => {
        if(!event.persisted || !active) return;
        active.reportSuspended=false;
        tick(active);reportTick(active);active.subscription?.start();
    });
    // A transport disconnect must not release a lease or erase local work.
    window.addEventListener('offline',() => active?.lease.pause('网络已断开，已停止编辑，请保留草稿。'));
})();
