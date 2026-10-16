(() => {
  'use strict';
  const el = (tag, text, cls) => {
    const node = document.createElement(tag);
    if (text !== undefined) node.textContent = text;
    if (cls) node.className = cls;
    return node;
  };
  const input = (title, name, maxLength, multiline = false) => {
    const label = el('label', title), node = el(multiline ? 'textarea' : 'input');
    node.name = name; node.maxLength = maxLength; node.required = true;
    label.append(node); return {label, node};
  };
  const button = (text, handler) => {
    const node = el('button', text); node.type = 'button'; node.onclick = handler; return node;
  };
  function facts(data) {
    const box = el('div', undefined, 'credit-gift-facts');
    const lines = [
      ['收款账号', `${data.target.display_name} / ${data.target.username} / ${data.target.id}`],
      ['赠送积分', data.amount], ['分类与有效期', '平台赠送 · 赠送积分 · 永久有效'],
      ['赠送原因', data.reason], ['来源依据', data.evidence_ref], ['请求编号', data.request_id]
    ];
    if (data.actor) lines.push(['操作人（入账时）', `${data.actor.display_name} / ${data.actor.username} / ${data.actor.id}`]);
    if (data.grant_id) lines.push(['入账编号', data.grant_id], ['流水编号', data.transaction_id], ['入账后总余额', data.balance_after]);
    for (const [name, value] of lines) box.append(el('p', `${name}：${value}`));
    return box;
  }
  async function create({api, canGift, memberId}) {
    const root = el('div', undefined, 'credit-gifts');
    root.append(el('p', '来源依据由管理员填报并留档，系统不自动核验外部凭证。此处仅处理人工赠送积分。', 'muted'));
    const storageKey = 'management-credit-gift-pending:' + memberId;
    const post = (route, data) => api('/api/credits/gifts/' + route, {method:'POST', body:JSON.stringify(data)});
    let reloadHistory;
    if (canGift) {
      const card = el('section', undefined, 'card'), form = el('form'), fields = el('fieldset');
      fields.append(el('legend', '新增管理员赠送'));
      const controls = [input('收款登录账号', 'username', 64), input('赠送积分数（正整数）', 'amount', 19),
        input('赠送原因（管理端留档）', 'reason', 1000, true), input('来源依据（工单、审批或活动编号）', 'evidence_ref', 500, true)];
      controls[1].node.inputMode = 'numeric'; controls[1].node.pattern = '[1-9][0-9]{0,18}';
      controls.forEach(c => fields.append(c.label));
      const message = el('p'); message.setAttribute('role', 'status');
      const previewBox = el('div'), actions = el('div', undefined, 'actions');
      const preview = el('button', '预览赠送'); preview.type = 'submit';
      let requestId = crypto.randomUUID(), ready = null, pending = null, uncertain = false, busy = false;
      const savePending = value => sessionStorage.setItem(storageKey, JSON.stringify(value));
      const clearPending = id => {
        // A detached page's late response must not erase a newer operation.
        const saved = sessionStorage.getItem(storageKey);
        if (saved && JSON.parse(saved).request_id === id) sessionStorage.removeItem(storageKey);
      };
      const edit = () => {
        ready = null; fields.disabled = false; preview.hidden = false;
        confirm.hidden = true; revise.hidden = true; previewBox.replaceChildren();
      };
      const finish = receipt => {
        // A confirmed receipt can be shown even if storage cleanup is unavailable.
        try { clearPending(receipt.request_id); } catch (_) { /* A retained request is safe to replay. */ }
        pending = null; ready = null; fields.disabled = true; preview.hidden = confirm.hidden = revise.hidden = true;
        form.dataset.dirty = 'false';
        previewBox.replaceChildren(facts(receipt)); next.hidden = false;
        message.textContent = '已入账。以下编号可用于核对来源记录与操作审计。';
      };
      const confirm = button('确认赠送', async () => {
        if (busy || (!ready && !pending)) return;
        const hadUncertainty = uncertain;
        const payload = pending || ready;
        try { savePending(payload); }
        catch (_) { message.textContent = '无法保存本次请求编号，请恢复浏览器会话存储后重试。尚未发起入账。'; return; }
        busy = true; pending = payload; uncertain = true;
        fields.disabled = true; confirm.disabled = true; preview.hidden = revise.hidden = true;
        try {
          const receipt = await post('apply', payload);
          finish(receipt);
          await reloadHistory();
        } catch (error) {
          if (!hadUncertainty && [400,401,403,409,422].includes(error.status)) {
            try { clearPending(payload.request_id); } catch (_) { /* Retrying a rejected request remains safe. */ }
            pending = null; uncertain = false; edit();
            message.textContent = error.message + ' 请重新核对并预览。';
          } else {
            message.textContent = error.message + ' 入账结果待确认，请用本次请求重试；不会重复入账。请求编号：' + payload.request_id;
            confirm.textContent = '重试确认结果';
          }
        } finally { busy = false; confirm.disabled = false; }
      });
      const revise = button('修改内容', () => { edit(); message.textContent = ''; });
      const next = button('新建赠送', () => {
        requestId = crypto.randomUUID(); uncertain = false; form.reset(); edit(); next.hidden = true; message.textContent = '';
      });
      confirm.hidden = revise.hidden = next.hidden = true;
      actions.append(preview, confirm, revise, next); form.append(fields, previewBox, message, actions); card.append(form); root.append(card);
      form.onsubmit = async event => {
        event.preventDefault();
        if (busy || pending || !form.reportValidity()) return;
        const data = {request_id:requestId, ...Object.fromEntries(controls.map(c => [c.node.name, c.node.value.trim()]))};
        busy = true; fields.disabled = preview.disabled = true; message.textContent = '正在核对收款账号…';
        try {
          const result = await post('preview', data);
          if (result.applied) { finish(result); await reloadHistory(); return; }
          ready = {...data, preview_token:result.preview_token};
          previewBox.replaceChildren(facts(result));
          preview.hidden = true; confirm.hidden = revise.hidden = false; confirm.textContent = `确认赠送 ${result.amount} 积分`;
          message.textContent = '请核对收款账号、积分数和来源依据，确认后入账。';
        } catch (error) { edit(); message.textContent = error.message; }
        finally { busy = false; preview.disabled = false; if (!ready && !pending && next.hidden) fields.disabled = false; }
      };
      try {
        const saved = sessionStorage.getItem(storageKey);
        if (saved) {
          pending = JSON.parse(saved); requestId = pending.request_id; uncertain = true;
          controls.forEach(c => { c.node.value = pending[c.node.name] || ''; });
          fields.disabled = true; preview.hidden = true; confirm.hidden = false; confirm.textContent = '重试确认结果';
          message.textContent = '有一笔结果待确认的赠送，请重试同一请求。请求编号：' + requestId;
        }
      } catch (_) {
        fields.disabled = true; preview.hidden = true;
        message.textContent = '无法读取上次赠送请求，请恢复浏览器会话存储后重新打开，避免重复操作。';
      }
    }
    const history = el('section', undefined, 'card'), filters = el('form', undefined, 'toolbar');
    history.append(el('h2', '赠送来源记录'));
    const username = input('收款账号（精确筛选）', 'username', 64), request = input('请求编号（精确筛选）', 'request_id', 36);
    username.node.required = request.node.required = false;
    const search = el('button', '查询记录'); search.type = 'submit';
    const latest = button('最新记录', () => { cursor = null; load(); });
    const older = button('更早记录', () => { cursor = nextCursor; load(); }); older.hidden = true;
    const rows = el('div'), status = el('p'); status.setAttribute('role', 'status');
    let cursor = null, nextCursor = null, generation = 0, activeFilters = {};
    const load = async () => {
      const serial = ++generation;
      older.disabled = search.disabled = latest.disabled = true;
      status.textContent = '正在查询来源记录…';
      const params = new URLSearchParams(activeFilters);
      if (cursor) params.set('before', cursor);
      try {
        const result = await api('/api/credits/gifts?' + params);
        if (serial !== generation) return;
        nextCursor = result.next; older.hidden = !nextCursor; rows.replaceChildren();
        for (const entry of result.entries) {
          const details = el('details'), summary = el('summary', `${entry.target.username} · +${entry.amount} 积分 · ${new Date(entry.created_at).toLocaleString()}`);
          details.append(summary, facts(entry)); rows.append(details);
        }
        status.textContent = result.entries.length ? '以下为管理员填报的来源记录，可按请求编号关联操作审计。' : '暂无符合条件的赠送记录。';
      } catch (error) { if (serial === generation) status.textContent = error.message + ' 当前记录未更新。'; }
      finally { if (serial === generation) older.disabled = search.disabled = latest.disabled = false; }
    };
    filters.onsubmit = event => {
      event.preventDefault(); cursor = null; activeFilters = {};
      if (username.node.value.trim()) activeFilters.username = username.node.value.trim();
      if (request.node.value.trim()) activeFilters.request_id = request.node.value.trim();
      load();
    };
    filters.append(username.label, request.label, search, latest, older); history.append(filters, status, rows); root.append(history);
    reloadHistory = () => { cursor = null; return load(); };
    await load(); return root;
  }
  window.ManagementCreditGifts = {create};
})();
