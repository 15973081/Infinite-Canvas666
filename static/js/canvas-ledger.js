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
        const res = await fetch(path, body === undefined ? {cache:'no-store'} : {
            method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body)
        });
        const data = await res.json().catch(()=> ({}));
        if(!res.ok){
            const error = new Error(typeof data.detail === 'string' ? data.detail : `流水请求失败（${res.status}）`);
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
        .ledger-actions{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.ledger-controls input,.ledger-controls button,.ledger-dialog button{font:inherit;padding:5px 9px;border:1px solid var(--line,#ccc);border-radius:7px;background:var(--card-solid,#fff);color:inherit}
        .ledger-controls button,.ledger-dialog button{cursor:pointer}.ledger-controls button:disabled{opacity:.4;cursor:default}.ledger-note{margin-top:6px;opacity:.75}.ledger-error{color:#d75a49}
        .ledger-dialog{z-index:2147483100;background:var(--card-solid,#fff);color:var(--text,#222);border:1px solid var(--line,#ddd);border-radius:16px;width:min(600px,90vw);max-height:85vh;padding:22px;font:14px/1.7 system-ui}
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
        try {
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
            controls.innerHTML='<div class="ledger-actions"><label>开始 <input type="date" name="ledger-from"></label><label>结束 <input type="date" name="ledger-to"></label><button data-clear>全部日期</button><button data-prev>上一页</button><span data-page></span><button data-next>下一页</button><button data-refresh>刷新</button><button data-recover>日志恢复</button></div><div class="ledger-note" aria-live="polite"></div>';
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
        const other=state(id).result?.totals.other_currencies || {};
        if(Object.keys(other).length) note.textContent+=' 其他币种未折算进人民币合计。';
    }
    root.CanvasLedger={view, record, refresh, readAll, mount, recover, revision:id=>state(id).result?.revision ?? -1};
    setInterval(()=>{if(activeId && document.visibilityState !== 'hidden') void refresh(activeId);},5000);
})(window);
