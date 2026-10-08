/* Shared ledger transport and history controls for both canvas clients. */
(function(root){
    const states = new Map();
    let activeId = '';
    const emptyTotals = () => ({total:0, image:0, video:0, calls:0, unknown:0, estimated:0, failed:0, records:0});
    const url = id => `/api/canvases/${encodeURIComponent(id)}/ledger`;
    const money = amount => `¥${new Intl.NumberFormat('zh-CN', {minimumFractionDigits:2, maximumFractionDigits:6}).format(Number(amount || 0)/1000000)}`;
    function state(id){
        if(!states.has(id)) states.set(id, {id, page:1, from:'', to:'', result:null, allTotals:null, queue:new Map(), loading:false, saving:false, error:'', writeError:'', sequence:0});
        return states.get(id);
    }
    function notify(id){ root.dispatchEvent(new CustomEvent('canvas-ledger-updated', {detail:{canvasId:id}})); }
    async function request(path, body){
        const init = body === undefined ? {cache:'no-store'} : {
            method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body)
        };
        const res = root.MemberCanvasEdit
            ? await root.MemberCanvasEdit.send(path, init, fetch)
            : await fetch(path, init);
        const data = await res.json().catch(()=> ({}));
        if(!res.ok){
            const messages = {canvas_protocol_required:'请先开始编辑，再进行日志恢复', canvas_lease_lost:'编辑资格已失效，请重新取得编辑权后再试', canvas_revision_conflict:'画布版本已变化，请重新载入后再核对日志'};
            const error = new Error(typeof data.detail === 'string' ? data.detail : messages[data.detail?.code] || data.detail?.message || `流水请求失败（${res.status}）`);
            error.status = res.status;
            throw error;
        }
        return data;
    }
    function dateMs(value, end=false){
        if(!value) return 0;
        const [y,m,d] = value.split('-').map(Number);
        const date = new Date(y,m-1,d);
        if(end) date.setDate(date.getDate()+1);
        return date.getTime();
    }
    function query(s, pageSize=50){
        const params = new URLSearchParams({page:String(s.page), page_size:String(pageSize)});
        if(s.from) params.set('from_ms', String(dateMs(s.from)));
        if(s.to) params.set('to_ms', String(dateMs(s.to,true)));
        return params;
    }
    async function refresh(id){
        if(!id) return;
        const s = state(id);
        if(s.loading) { s.refreshAgain = true; return; }
        s.loading = true;
        const seq = s.sequence;
        try {
            const result = await request(`${url(id)}?${query(s)}`);
            let allTotals = result.totals;
            if(s.from || s.to) allTotals = (await request(`${url(id)}?page_size=1`)).totals;
            if(seq !== s.sequence) { s.refreshAgain = true; return; }
            s.result = result;
            s.page = result.page;
            s.allTotals = allTotals;
            s.error = '';
        } catch(error){ s.error = error.message; }
        finally {
            s.loading = false;
            notify(id);
            if(s.refreshAgain){ s.refreshAgain = false; void refresh(id); }
        }
    }
    function view(id){
        if(!id) return null;
        activeId = id;
        const s = state(id);
        if(!s.result && !s.loading && !s.error) void refresh(id);
        return {logs:s.result?.logs || [], totals:s.result?.totals || emptyTotals(), allTotals:s.allTotals,
            page:s.page, pages:s.result?.pages || 1, pending:s.queue.size, loading:s.loading,
            error:s.writeError || s.error, ready:Boolean(s.result), from:s.from, to:s.to};
    }
    async function flush(id){
        const s = state(id);
        if(s.saving) return s.savePromise;
        if(!s.queue.size) return true;
        const batch = [...s.queue.entries()].slice(0,100);
        s.saving = true;
        s.savePromise = (async()=>{
            try {
                const data = await request(url(id)+'/entries', {logs:batch.map(([,log])=>log)});
                if(data.report?.invalid) throw new Error('部分日志字段不完整，流水未全部保存，请检查恢复报告');
                for(const [key,log] of batch) if(s.queue.get(key) === log) s.queue.delete(key);
                s.writeError = data.report?.conflicts ? '检测到费用快照冲突，已保留原费用；可在日志恢复中核对。' : '';
                return true;
            } catch(error){ s.writeError = `流水保存失败，将自动重试：${error.message}`; return false; }
            finally {
                s.saving = false;
                notify(id);
                if(s.queue.size) setTimeout(()=>flush(id), 3000);
                void refresh(id);
            }
        })();
        return s.savePromise;
    }
    function record(id, log){
        if(!id || !log) return;
        const s = state(id), copy = JSON.parse(JSON.stringify(log));
        s.queue.set(copy.id || JSON.stringify(copy), copy);
        void flush(id);
    }
    async function readAll(id, options={}){
        // A stable revision prevents exports/plugins from mixing different pages during new calls.
        for(let attempt=0; attempt<3; attempt++){
            try {
                const params = new URLSearchParams({page_size:'200', page:'1'});
                if(options.from_ms) params.set('from_ms',String(options.from_ms));
                if(options.to_ms) params.set('to_ms',String(options.to_ms));
                const first = await request(`${url(id)}?${params}`);
                const logs = [...first.logs];
                params.set('expected_revision',String(first.revision));
                for(let page=2; page<=first.pages; page++){
                    params.set('page',String(page));
                    const next = await request(`${url(id)}?${params}`);
                    logs.push(...next.logs);
                }
                return {...first, logs};
            } catch(error){ if(error.status !== 409 || attempt === 2) throw error; }
        }
    }
    function styles(){
        if(document.getElementById('canvas-ledger-style')) return;
        const el = document.createElement('style'); el.id='canvas-ledger-style';
        el.textContent=`.ledger-controls{padding:10px 18px;border-bottom:1px solid var(--line,#ddd);font:12px/1.6 system-ui;flex-shrink:0;color:var(--text,#333)}
        .ledger-actions{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.ledger-controls input,.ledger-controls button,.ledger-dialog button{font:inherit;padding:5px 9px;border:1px solid var(--line,#ccc);border-radius:7px;background:var(--ledger-surface,var(--card-solid,var(--card,#fff)));color:var(--ledger-text,inherit)}
        .ledger-controls button,.ledger-dialog button{cursor:pointer}.ledger-controls button:disabled,.ledger-dialog button:disabled{opacity:1;cursor:default;background:var(--ledger-disabled-bg,#f1f5f9);color:var(--ledger-disabled-text,#64748b);border-color:var(--ledger-border,var(--line,#ddd))}.ledger-note{margin-top:6px;opacity:.75}.ledger-error{color:#d75a49}
        .ledger-dialog{z-index:2147483100;background:var(--ledger-surface,var(--card-solid,var(--card,#fff)));color:var(--ledger-text,var(--text,#222));border:1px solid var(--line,#ddd);border-radius:16px;width:min(600px,90vw);max-height:85vh;padding:22px;font:14px/1.7 system-ui}
        :is(.theme-dark,.studio-theme-dark) :is(.ledger-controls,.ledger-dialog){--ledger-surface:#192230;--ledger-text:#dce3ee;--ledger-border:#364152;--ledger-disabled-bg:#141c27;--ledger-disabled-text:#8794a7;color:var(--ledger-text);color-scheme:dark;border-color:var(--ledger-border)}
        :is(.theme-dark,.studio-theme-dark) :is(.ledger-controls input,.ledger-controls button,.ledger-dialog button){border-color:var(--ledger-border)}
        .ledger-controls button:not(:disabled):hover,.ledger-dialog button:not(:disabled):hover{filter:brightness(.95)}
        :is(.theme-dark,.studio-theme-dark) :is(.ledger-controls button,.ledger-dialog button):not(:disabled):hover{background:#253246;filter:none}
        :is(.ledger-controls,.ledger-dialog) :is(button,input):focus-visible{outline:2px solid #829dbf;outline-offset:2px}
        :is(.theme-dark,.studio-theme-dark) .ledger-note{color:#a9b5c7;opacity:1}
        :is(.theme-dark,.studio-theme-dark) .ledger-note.ledger-error{color:#f0a59a}
        .ledger-dialog::backdrop{background:#0007}.ledger-dialog pre{white-space:pre-wrap;overflow-wrap:anywhere;font:inherit;max-height:42vh;overflow:auto}.ledger-dialog footer{display:flex;justify-content:flex-end;gap:10px}`;
        document.head.append(el);
    }
    async function recover(id){
        styles();
        const dialog = document.createElement('dialog'); dialog.className='ledger-dialog';
        dialog.innerHTML='<h3>日志恢复 · 对齐整个画布</h3><p>从当前 logs、画布备份和明确关联的任务中补齐流水。不会恢复节点布局、重新生成内容或覆盖已有费用。</p><pre aria-live="polite">正在核对…</pre><footer><button data-close>关闭</button><button data-apply disabled>确认补录</button></footer>';
        for(const event of ['click','pointerdown','keydown','wheel']) dialog.addEventListener(event,e=>e.stopPropagation());
        dialog.querySelector('[data-close]').onclick=()=>dialog.close();
        dialog.addEventListener('close',()=>dialog.remove());
        document.body.append(dialog); dialog.showModal();
        const text=dialog.querySelector('pre'), apply=dialog.querySelector('[data-apply]');
        if(root.CanvasSession?.enabled) dialog.querySelector('p').textContent='从当前空间云端保存的画布日志、备份和关联任务中核对补录。请先保存尚未提交的画布更改；补录不会恢复布局、重新生成或覆盖已有费用。';
        try {
            if(root.CanvasSession?.enabled && (!root.MemberCanvasEdit?.canEdit || root.MemberCanvasEdit.active?.id !== id)){
                throw new Error('当前为查看模式，请关闭此窗口并开始编辑，再进行日志恢复。');
            }
            while(state(id).queue.size) {
                if(!await flush(id)) throw new Error('请等待尚未保存的流水写入后重试');
            }
            const preview=await request(url(id)+'/recovery/preview',{});
            const r=preview.report;
            text.textContent=`将新增 ${r.added} 条，补全 ${r.updated} 条，已有重复 ${r.duplicate} 条。\n冲突候选 ${r.conflicts} 条（保留原费用），无效 ${r.invalid} 条。\n核对前：${preview.before.records} 条 / ${money(preview.before.total)}\n补录后：${preview.after.records} 条 / ${money(preview.after.total)}\n备份 ${preview.sources.backups} 份，关联任务 ${preview.sources.tasks} 条。\n\n${preview.coverage_note}`;
            for(const issue of [...r.issues,...preview.source_errors]) text.textContent+=`\n${issue.source || issue.id || ''}：${issue.reason}`;
            apply.disabled=!(r.added || r.updated || r.conflicts);
            apply.onclick=async()=>{
                apply.disabled=true;
                try {
                    const result=await request(url(id)+'/recovery/apply',{preview_token:preview.preview_token});
                    text.textContent=`恢复完成：新增 ${result.report.added} 条，补全 ${result.report.updated} 条。\n现有 ${result.after.records} 条流水，费用 ${money(result.after.total)}。\n${result.coverage_note}`;
                    await refresh(id);
                } catch(error){text.textContent=error.message+'。请关闭后重新预览。';}
            };
        } catch(error){text.textContent=error.message;}
    }
    function mount(list, id){
        if(!list || !id) return;
        styles();
        const controlId=`${list.id}-ledger-controls`;
        let controls=document.getElementById(controlId);
        if(!controls){
            controls=document.createElement('div'); controls.id=controlId; controls.className='ledger-controls';
            controls.innerHTML='<div class="ledger-actions"><div class="ledger-filters"><label>开始 <input type="date" name="ledger-from"></label><label>结束 <input type="date" name="ledger-to"></label><button data-clear>全部日期</button><button data-refresh>刷新</button></div><div class="ledger-pagination"><button data-prev>上一页</button><span data-page></span><button data-next>下一页</button><button data-recover>日志恢复</button></div></div><div class="ledger-note" aria-live="polite"></div>';
            controls.addEventListener('click', e=>{
                e.stopPropagation();
                const button=e.target.closest('button'); if(!button) return;
                const s=state(controls.dataset.canvasId);
                if(button.hasAttribute('data-recover')) {void recover(s.id);return;}
                if(button.hasAttribute('data-prev')) s.page=Math.max(1,s.page-1);
                if(button.hasAttribute('data-next')) s.page++;
                if(button.hasAttribute('data-clear')) {s.from='';s.to='';s.page=1;}
                s.sequence++; void refresh(s.id);
            });
            controls.addEventListener('change', e=>{
                e.stopPropagation();
                const s=state(controls.dataset.canvasId);
                s.from=controls.querySelector('[name=ledger-from]').value;
                s.to=controls.querySelector('[name=ledger-to]').value;
                s.page=1; s.sequence++; void refresh(s.id);
            });
            list.before(controls);
        }
        controls.dataset.canvasId=id;
        const s=view(id);
        controls.querySelector('[name=ledger-from]').value=s.from;
        controls.querySelector('[name=ledger-to]').value=s.to;
        controls.querySelector('[data-page]').textContent=`第 ${s.page}/${s.pages} 页 · ${s.totals.records} 条`;
        controls.querySelector('[data-prev]').disabled=s.page<=1 || s.loading;
        controls.querySelector('[data-next]').disabled=s.page>=s.pages || s.loading;
        const note=controls.querySelector('.ledger-note');
        note.classList.toggle('ledger-error',Boolean(s.error));
        note.textContent=s.error || (s.loading ? '正在读取全部流水…' : s.pending ? `${s.pending} 条流水正在保存…` : '费用合计覆盖所选日期的全部流水；每页显示 50 条。历史缺失可用“日志恢复”核对。');
        const other=state(id).result?.totals?.other_currencies || {};
        if(Object.keys(other).length) note.textContent+=' 其他币种未折算进人民币合计。';
    }
    function durationLabel(ms,format,unknown='耗时未知'){
        if(typeof ms!=='number' || !Number.isFinite(ms) || ms<=0)return unknown;
        return ms<1000 ? '<1s' : format(ms);
    }
    function promptMarkup(prompt,escape){
        const value=typeof prompt==='string' ? prompt : '';
        return `<div class="log-prompt${value?'':' is-empty'}">
            <div class="log-prompt-head"><span>提示词</span><div class="log-prompt-actions">
                ${value?'<button type="button" data-log-expand aria-expanded="false">展开全文</button><button type="button" data-log-copy="prompt">复制提示词</button>':''}
                <button type="button" data-log-copy="record">复制记录</button>
            </div></div>
            <div class="log-prompt-text">${value?escape(value):'未记录提示词'}</div>
            <span class="log-copy-feedback" role="status" aria-live="polite"></span>
        </div>`;
    }
    function recordText(log,formatDuration){
        const request=log.request || {},cost=log._ledger_cost || log.cost || {};
        const micros=Number(cost.amount_micros),money=cost.status==='priced' && Number.isFinite(micros)
            ? `${cost.currency || 'CNY'} ${new Intl.NumberFormat('zh-CN',{minimumFractionDigits:2,maximumFractionDigits:6}).format(micros/1000000)}` : '待核算';
        const taskId=log.canvas_task_id || request.canvas_task_id || request.task_id || request.taskId || '';
        const outputs=(log.outputs || []).map(item=>typeof item==='string'?item:item?.url || '').filter(Boolean);
        return [
            `状态：${log.status==='failed'?'失败':'成功'}`,
            `时间：${log.createdAt?new Date(log.createdAt).toLocaleString('zh-CN'):'未知'}`,
            `平台：${log.platform || '-'}`,
            `模型：${log.billingModel || log.model || '-'}`,
            `费用：${money}`,
            `耗时：${durationLabel(log.runMs,formatDuration)}`,
            taskId?`任务 ID：${taskId}`:'',
            log.error?`错误：${log.error}`:'',
            `提示词：\n${log.prompt || ''}`,
            `输出 (${outputs.length})：${outputs.length?'\n'+outputs.join('\n'):''}`
        ].filter(Boolean).join('\n');
    }
    async function copyText(value){
        if(root.navigator?.clipboard?.writeText){
            try {await root.navigator.clipboard.writeText(value);return;} catch(_) {}
        }
        const field=document.createElement('textarea');
        field.value=value;field.setAttribute('readonly','');field.style.cssText='position:fixed;left:-9999px;top:0;opacity:0';
        document.body.appendChild(field);
        try {field.focus();field.select();if(!document.execCommand?.('copy'))throw new Error('clipboard unavailable');}
        finally {field.remove();}
    }
    function bindLogPrompts(list,logs,formatDuration){
        list.querySelectorAll('.log-item[data-log-index]').forEach(item=>{
            const log=logs[Number(item.dataset.logIndex)];if(!log)return;
            const box=item.querySelector('.log-prompt'),expand=box?.querySelector('[data-log-expand]');
            if(expand)expand.onclick=()=>{
                const open=box.classList.toggle('expanded');
                expand.textContent=open?'收起':'展开全文';expand.setAttribute('aria-expanded',String(open));
            };
            box?.querySelectorAll('[data-log-copy]').forEach(button=>{
                button.onclick=async()=>{
                    const feedback=box.querySelector('.log-copy-feedback');
                    const value=button.dataset.logCopy==='prompt'?log.prompt:recordText(log,formatDuration);
                    if(!value)return;
                    try {await copyText(value);feedback.textContent='已复制完整内容';feedback.classList.remove('error');}
                    catch(_) {feedback.textContent='复制失败，请展开后手动选择文字';feedback.classList.add('error');}
                };
            });
        });
    }
    function costRow(log,index,{escape,date,model,cost,thumbs,detail}){
        return `<tr class="cost-ledger-row"><td><time>${escape(date)}</time><span class="cost-status ${log.status==='failed'?'is-failed':''}">${log.status==='failed'?'失败':'成功'}</span></td>
            <td><span class="cost-model" title="${escape(model)}">${escape(model || '-')}</span><small>${escape(log.platform || '-')} · 输出 ${(log.outputs || []).length}</small></td>
            <td class="cost-amount">${cost || '<span class="cost-unpriced">未计价</span>'}</td>
            <td><button type="button" class="cost-detail-toggle" data-cost-detail="${index}" aria-expanded="false">详情</button></td>
            <td class="cost-resource"><div class="log-thumbs">${thumbs || '<span class="cost-no-output">无输出</span>'}</div></td></tr>
            <tr class="cost-detail-row" data-cost-detail-row="${index}" hidden><td colspan="5">${detail}</td></tr>`;
    }
    function costTable(rows){
        return `<table class="cost-ledger-table"><thead><tr><th>时间 / 状态</th><th>模型</th><th class="cost-amount">费用</th><th></th><th class="cost-resource">资源</th></tr></thead><tbody>${rows}</tbody></table>`;
    }
    function bindCostDetails(list){
        list.querySelectorAll('[data-cost-detail]').forEach(button=>{
            const row=list.querySelector(`[data-cost-detail-row="${button.dataset.costDetail}"]`);
            button.onclick=e=>{
                e.stopPropagation(); row.hidden=!row.hidden;
                button.textContent=row.hidden?'详情':'收起';button.setAttribute('aria-expanded',String(!row.hidden));
            };
        });
    }
    root.CanvasLedger={view, record, refresh, readAll, mount, recover, durationLabel,promptMarkup,recordText,copyText,bindLogPrompts,costRow,costTable,bindCostDetails,
        revision:id=>state(id).result?.revision ?? -1};
    // A totals label calling view() must not subscribe the entire page to
    // perpetual full-ledger downloads. Poll only an explicitly open panel.
    setInterval(()=>{
        const panelOpen=['logModal','smartLogModal'].some(id=>document.getElementById(id)?.classList.contains('open'));
        if(activeId && panelOpen && document.visibilityState !== 'hidden' && !state(activeId).loading) void refresh(activeId);
    },30000);
})(window);
