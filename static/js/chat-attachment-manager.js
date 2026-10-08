(() => {
  'use strict';
  const trigger = document.getElementById('chatAttachmentManager');
  const node = (tag, text) => {
    const element = document.createElement(tag);
    if (text !== undefined) element.textContent = text;
    return element;
  };
  const bytes = value => value >= 1024 ** 3 ? (value / 1024 ** 3).toFixed(2) + ' GB'
    : value >= 1024 ** 2 ? (value / 1024 ** 2).toFixed(1) + ' MB' : Math.ceil(value / 1024) + ' KB';
  async function api(url, init = {}) {
    const response = await fetch(url, init);
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const code = data.detail?.code;
      const messages = {authentication_required:'登录已失效，请重新登录后查看附件。',
        workspace_forbidden:'当前账号没有此空间的访问权限，请切换空间。',
        workspace_unavailable:'当前空间不可用，请切换到可用空间。',
        permission_denied:'当前账号没有查看或管理附件的权限。',
        member_identity_changed:'登录账号已变化，请刷新页面后重试。'};
      throw Error(typeof data.detail === 'string' ? data.detail : messages[code]
        || (response.status === 401 ? '登录已失效，请重新登录后查看附件。'
          : response.status === 503 ? '附件服务暂不可用，请稍后重试。' : '附件请求失败，请重试。'));
    }
    return data;
  }
  function showAudit(returnFocus) {
    const dialog = node('dialog');
    dialog.className = 'chat-attachment-dialog';
    dialog.setAttribute('aria-label', '附件共享与删除记录');
    const head = node('header'), close = node('button', '关闭');
    close.type = 'button'; close.onclick = () => dialog.close();
    head.append(node('h2', '附件共享与删除记录'), close);
    const list = node('div'), status = node('p'), more = node('button', '加载更多记录');
    status.setAttribute('role', 'status'); more.type = 'button'; more.hidden = true;
    dialog.append(head, node('p', '仅显示当前空间内本人附件的记录。附件删除后仍保留操作记录，不包含文件正文。'), list, status, more);
    document.body.append(dialog);
    dialog.addEventListener('close', () => { dialog.remove(); returnFocus.focus(); }, { once: true });
    dialog.showModal();
    let before = null;
    async function load() {
      more.disabled = true; status.textContent = '加载中…';
      try {
        const data = await api('/api/chat/attachments/audit' + (before ? '?before=' + encodeURIComponent(before) : ''));
        if (!dialog.isConnected) return;
        for (const event of data.events) {
          const row = node('article');
          row.append(node('p', event.label + ' · ' + event.actor + ' · ' + new Date(event.created_at).toLocaleString()),
            node('p', '附件编号：' + event.asset_id + (event.attempts !== undefined ? ' · 已尝试 ' + event.attempts + ' 次' : '')));
          list.append(row);
        }
        before = data.next_before; more.hidden = !before;
        more.textContent = '加载更多记录';
        status.textContent = list.children.length ? '' : '暂无本人附件的操作记录。';
      } catch (error) {
        if (dialog.isConnected) { status.textContent = error.message; more.hidden = false; more.textContent = '重试加载记录'; }
      } finally { more.disabled = false; }
    }
    more.onclick = load; load();
  }
  trigger.addEventListener('click', () => {
    if (document.querySelector('.chat-attachment-manager')) return;
    const dialog = node('dialog');
    dialog.className = 'chat-attachment-dialog chat-attachment-manager';
    dialog.setAttribute('aria-label', '我的对话附件');
    const head = node('header'), close = node('button', '关闭');
    close.type = 'button';
    close.onclick = () => dialog.close();
    const title = node('div'); title.append(node('h2', '我的对话附件'), node('p', '管理上传文件、共享范围与存储空间'));
    head.append(title, close);
    const help = node('details'), helpTitle = node('summary', '仅本人可访问 · 查看存储与删除规则');
    help.className = 'attachment-help';
    help.append(helpTitle, node('p', '新附件默认仅本人可访问。容量统计包含各空间本人附件及预览。未引用仅表示当前没有引用，不会自动删除；请确认是否还需保留。'));
    const summary = node('p'), meter = node('progress');
    const capacity = node('section'), capacityHead = node('div'), percentage = node('span', '读取中');
    capacity.className = 'attachment-capacity'; capacityHead.className = 'attachment-capacity-heading';
    capacityHead.append(node('span', '个人存储空间'), percentage);
    summary.textContent = '正在读取容量信息…'; meter.hidden = true;
    capacity.append(capacityHead, summary, meter);
    meter.setAttribute('aria-label', '个人附件容量');
    const toolbar = node('div'), sort = node('select'), filter = node('input'), filterLabel = node('label');
    toolbar.className = 'attachment-toolbar'; filterLabel.className = 'attachment-filter';
    sort.setAttribute('aria-label', '附件排序');
    for (const [value, text] of [['newest', '最新上传'], ['size', '大小降序']]) {
      const option = node('option', text); option.value = value; sort.append(option);
    }
    filter.type = 'checkbox'; filterLabel.append(filter, document.createTextNode('仅看未引用'));
    const list = node('div'), status = node('p');
    list.className = 'attachment-list'; status.className = 'attachment-status';
    status.setAttribute('role', 'status');
    const state = node('div'), retry = node('button', '重试加载');
    state.className = 'attachment-state'; retry.type = 'button'; retry.hidden = true;
    state.append(status, retry);
    let offset = 0, timer, loading = false;
    const selected = new Set();
    const action = (text, handler) => {
      const button = node('button', text); button.type = 'button';
      button.onclick = async () => {
        button.disabled = true;
        try { await handler(); } catch (error) { setStatus(error.message, true); }
        finally { button.disabled = button === bulk ? !selected.size : false; }
      };
      return button;
    };
    async function remove(file) {
      return api('/api/chat/attachments/' + file.id + '?confirm_permanent=true', { method: 'DELETE' });
    }
    const bulk = action('删除选中的未引用附件', async () => {
      if (!selected.size) { status.textContent = '请先选择未引用附件。'; return; }
      if (!confirm('彻底删除选中的 ' + selected.size + ' 个未引用附件及预览？既有备份和已发给模型的内容需另行处理。')) return;
      const errors = [];
      for (const id of selected) {
        try { await remove({ id }); } catch (error) { errors.push(error.message); }
      }
      await load();
      if (errors.length) status.textContent = errors.length + ' 个附件待处理：' + errors[0];
    });
    bulk.className = 'attachment-danger'; bulk.disabled = true;
    const selection = node('span', '选择未引用附件后可批量清理'), footer = node('footer');
    footer.className = 'attachment-footer'; footer.append(selection, bulk);
    function updateSelection() {
      selection.textContent = selected.size ? '已选择 ' + selected.size + ' 个未引用附件' : '选择未引用附件后可批量清理';
      bulk.disabled = !selected.size;
    }
    function setStatus(message, error = false) {
      status.textContent = message; state.dataset.state = error ? 'error' : message ? 'info' : 'idle';
      retry.hidden = !error;
    }
    const auditButton = node('button', '共享与删除记录');
    auditButton.type = 'button'; auditButton.onclick = () => showAudit(auditButton);
    toolbar.append(sort, filterLabel, action('刷新', () => load()), auditButton);
    dialog.append(head, capacity, help, toolbar, list, state, footer);
    document.body.append(dialog);
    dialog.addEventListener('close', () => { clearTimeout(timer); trigger.focus(); dialog.remove(); }, { once: true });
    dialog.showModal();
    async function load(more = false) {
      if (loading) return;
      loading = true;
      clearTimeout(timer);
      setStatus('正在加载附件…');
      list.setAttribute('aria-busy', 'true'); sort.disabled = filter.disabled = true;
      try {
        if (!more) offset = 0;
        const data = await api('/api/chat/attachments?offset=' + offset + '&sort=' + sort.value + '&unreferenced=' + filter.checked);
        if (!dialog.isConnected) return;
        if (!Array.isArray(data.files)) throw Error('附件列表暂不可用，请重试。');
        if (!more) { list.replaceChildren(); selected.clear(); updateSelection(); }
        else list.querySelector('.attachment-more')?.remove();
        if (data.usage) {
          const u = data.usage;
          summary.textContent = '已占用 ' + bytes(u.used_bytes) + ' / ' + bytes(u.quota_bytes) + '，剩余 ' + bytes(u.remaining_bytes)
            + (u.reserved_bytes ? '，上传预留 ' + bytes(u.reserved_bytes) : '');
          meter.max = u.quota_bytes; meter.value = Math.min(u.quota_bytes, u.used_bytes + u.reserved_bytes);
          const ratio = meter.max > 0 ? meter.value / meter.max * 100 : 0;
          meter.hidden = false; percentage.textContent = (ratio > 0 && ratio < 1 ? '<1' : Math.round(ratio)) + '% 已使用';
          capacity.dataset.level = meter.value / meter.max >= .9 ? 'high' : 'normal';
        } else {
          summary.textContent = '容量信息暂不可用'; percentage.textContent = '—'; meter.hidden = true;
        }
        for (const file of data.files) {
          const row = node('article');
          row.className = 'attachment-card';
          const icon = node('span', (file.name?.split('.').pop() || 'FILE').slice(0, 5).toUpperCase());
          icon.className = 'attachment-file-icon'; icon.setAttribute('aria-hidden', 'true');
          const content = node('div'), actions = node('div'), metadata = node('div');
          content.className = 'attachment-file-content'; actions.className = 'attachment-file-actions'; metadata.className = 'attachment-file-meta';
          metadata.append(node('span', bytes(file.size || 0)), node('span', file.shared ? '空间共享' : '仅本人'));
          if (file.referenced !== undefined) metadata.append(node('span', file.referenced ? '使用中' : '未引用'));
          content.append(node('h3', file.name), metadata); row.append(icon, content, actions);
          if (file.upload_failed) row.append(node('p', '上传失败，可清理残留文件并释放容量。'));
          if (file.referenced === false && (file.status === 'ready' || file.cleanup_available)) {
            const label = node('label'), checkbox = node('input'); checkbox.type = 'checkbox';
            checkbox.setAttribute('aria-label', '选择 ' + file.name);
            checkbox.onchange = () => { checkbox.checked ? selected.add(file.id) : selected.delete(file.id); updateSelection(); };
            label.append(checkbox, document.createTextNode('选择')); actions.append(label);
          }
          if (file.status === 'ready') {
            const download = node('a', '下载'); download.href = file.url; download.target = '_blank'; download.rel = 'noopener';
            actions.append(download, action(file.shared ? '取消共享' : '共享给当前空间', async () => {
              if (!confirm(file.shared ? '取消共享后，其他成员将无法再读取此附件。继续？' : '共享后当前空间成员可以读取此附件。继续？')) return;
              await api('/api/chat/attachments/' + file.id, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ shared: !file.shared }) });
              await load();
            }));
          }
          if (file.status === 'deleting') row.append(node('p', '正在清理 · 已尝试 ' + (file.attempts || 0) + ' 次'
            + (file.last_error ? ' · ' + file.last_error : '')
            + (file.next_retry_at ? ' 下次检查：' + new Date(file.next_retry_at).toLocaleString() : '')));
          const deleteButton=action(file.status === 'deleting' ? '重试删除' : '彻底删除', async () => {
            if (!confirm('彻底删除“' + file.name + '”及其预览？仍被引用时会拒绝删除；既有备份和已发送给模型的内容不在此删除范围。')) return;
            try { const result = await remove(file); await load(); if (result.pending) status.textContent = '已进入清理队列，后台会继续处理。'; }
            catch (error) { await load(); throw error; }
          });
          deleteButton.disabled=file.cleanup_available===false;
          deleteButton.className = 'attachment-danger'; actions.append(deleteButton);
          list.append(row);
        }
        setStatus(list.children.length ? '' : '没有本人上传的对话附件。');
        if (data.next_offset !== null) {
          const moreButton = action('加载更多', async () => { offset = data.next_offset; await load(true); });
          moreButton.className = 'attachment-more';
          list.append(moreButton);
        }
        if (data.files.some(file => file.status === 'deleting')) timer = setTimeout(() => load().catch(error => { status.textContent = error.message; }), 15000);
      } catch (error) {
        if (dialog.isConnected) {
          setStatus(error.message, true);
          if (meter.hidden) { summary.textContent = '容量信息暂未加载'; percentage.textContent = '—'; }
        }
      } finally { loading = false; sort.disabled = filter.disabled = false; list.setAttribute('aria-busy', 'false'); }
    }
    sort.onchange = filter.onchange = () => load().catch(error => { status.textContent = error.message; });
    retry.onclick = () => load();
    load().catch(error => { status.textContent = error.message; });
  });
  Promise.resolve(window.CanvasSession?.ready).then(() => { trigger.hidden = !window.CanvasSession?.enabled; });
})();
