(() => {
  'use strict';
  const $ = (s) => document.querySelector(s);
  let me, view = 'overview', workspace = '', pageAfter = '', auditBefore = '', serial = 0, reportRequest = 0;
  const names = {overview: '概览', members: '成员与分配', spaces: '空间', roles: '角色与权限', maintenance: '维护中心', providers: '供应商与分配', audit: '操作审计'};
  const errors = {
    authentication_required: '登录已失效，请重新登录。', management_permission_required: '此账号尚未获授管理权限。',
    invalid_credentials: '账号或密码不正确。', login_rate_limited: '登录尝试过多，请稍后重试。',
    permission_denied: '当前账号没有此项权限。', cannot_delegate_permission: '不能授予超出你权限范围的角色。',
    protected_administrator: '此管理员账号受到保护。', builtin_role_protected: '内置角色不能修改，请新建自定义角色。',
    last_platform_administrator: '平台必须保留至少一位有效超级管理员。', last_workspace_administrator: '启用的空间必须保留至少一位有效管理员。',
    member_version_conflict: '成员授权已发生变化，请刷新后重新选择。', role_version_conflict: '角色已被修改，请刷新后重试。',
    role_impact_changed: '受影响成员已变化，请重新预览。', member_not_found: '未找到此成员。',
    workspace_unavailable: '空间已归档或不可访问。', username_exists: '账号已存在。', role_name_exists: '此范围内已有同名角色。',
    active_administrator_required: '请填写已激活成员的登录账号。',
    provider_version_conflict: '供应商配置或分配已变化，请刷新后重新编辑。',
    provider_secret_key_unavailable: '服务端未配置凭证加密密钥，请由维护人员配置后重试。',
    provider_secret_unavailable: '服务端暂时无法解密凭证，请核对加密密钥与备份。',
    invalid_provider_config: '供应商配置格式不正确，请检查字段和协议。',
    invalid_provider_models: '模型列表格式不正确，每行填写一个模型。',
    invalid_provider_endpoint: '接口地址不能包含密码、查询参数、片段或空白字符。',
    invalid_provider_secrets: '凭证替换与清除不能同时选择，请检查输入。',
    invalid_provider_assignment: '默认供应商必须同时勾选分配，且不能重复分配。',
    provider_reason_required: '请填写操作原因。', provider_not_found: '供应商不存在，请刷新。',
    provider_endpoint_required: '请先编辑并保存供应商的 API Base URL。', provider_key_required: '请先编辑并保存供应商的 API Key。',
    page_report_not_found: '未找到当前管理范围内的报告，请刷新。',
    page_report_changed: '报告已更新或已经核对，请刷新列表后重新确认。',
    page_report_not_reviewable: '页面已重新在线或正常关闭，请刷新列表。',
    invalid_page_report_review: '请选择核对结果并填写处理说明。',
    maintenance_version_conflict: '维护状态已发生变化，请刷新后重新操作。',
    maintenance_transition_invalid: '当前状态不允许此项切换，请刷新后重新选择。',
    maintenance_recovery_confirmation_required: '恢复开放前请确认已完成运行与数据检查。',
    maintenance_future_time_required: '请选择未来的维护时间。',
    activation_required: '此成员需要先完成激活。', management_dependency_unavailable: '管理服务暂时无法连接数据库，请稍后重试。',
    origin_forbidden: '管理站点地址不匹配，请从配置的管理地址重新打开。'
  };
  function el(tag, text, cls) { const e = document.createElement(tag); if (text !== undefined) e.textContent = text; if (cls) e.className = cls; return e; }
  function notice(text, error = false) { const e = $('#message'); e.textContent = text; e.className = error ? 'error' : ''; e.hidden = false; }
  async function api(path, options = {}) {
    const response = await fetch(path, {credentials: 'same-origin', ...options, headers: {'Content-Type': 'application/json', ...options.headers}});
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      if (response.status === 401) showLogin();
      const code = data.detail?.code;
      const error = new Error(errors[code] || (response.status === 422 ? '请检查填写内容。' : '操作未完成，请刷新后重试。'));
      error.status = response.status; throw error;
    }
    return data;
  }
  const call = (path, method, body) => api(path, {method, ...(body === undefined ? {} : {body: JSON.stringify(body)})});
  function scoped(path, extra = {}) { const p = new URLSearchParams(extra); if (workspace) p.set('workspace', workspace); return path + (p.size ? '?' + p : ''); }
  function allowed(permission) { return (workspace ? me.workspaces.find(w => w.id === workspace)?.permissions || [] : me.permissions).includes(permission); }
  function button(text, fn, cls) { const b = el('button', text, cls); b.type = 'button'; b.onclick = () => execute(fn, b); return b; }
  async function execute(fn, b) { if (b) b.disabled = true; try { await fn(); } catch (e) { notice(e.message, true); } finally { if (b) b.disabled = false; } }
  function table(heads, rows) {
    const wrap = el('div', undefined, 'table-wrap'), t = el('table'), h = el('tr');
    heads.forEach(n => h.append(el('th', n))); const head = el('thead'); head.append(h); t.append(head);
    const body = el('tbody');
    rows.forEach(cells => { const tr = el('tr'); cells.forEach(v => { const td = el('td'); td.append(v instanceof Node ? v : document.createTextNode(String(v ?? ''))); tr.append(td); }); body.append(tr); });
    t.append(body); wrap.append(t); return wrap;
  }
  function labelText(name, id) { const d = el('div', name); if (id) d.append(el('small', id)); return d; }
  function actions(...buttons) { const e = el('div'); e.append(...buttons); return e; }
  function field(name, label, value = '', type = 'text') {
    const l = el('label', label), i = el('input'); i.name = name; i.value = value; i.type = type; i.required = true;
    i.maxLength = name === 'username' ? 64 : name === 'description' ? 1000 : name === 'base_url' ? 2000 : 80; l.append(i); return l;
  }
  function choices(name, catalog, selected = []) {
    const d = el('div', undefined, 'permissions'); catalog.forEach(p => {
      const l = el('label', undefined, 'check'), i = el('input'); i.type = 'checkbox'; i.name = name; i.value = p.id;
      i.checked = selected.includes(p.id); i.disabled = p.delegatable === false; l.append(i, document.createTextNode(p.name)); d.append(l);
    }); return d;
  }
  function dialog(title, elements, submit, confirmText = '确认保存', wide = false) {
    const d = $('#dialog'), f = $('#dialog-form'), error = el('p', '', 'dialog-error');
    error.setAttribute('role', 'alert'); error.hidden = true;
    d.classList.toggle('wide', wide); f.reset(); $('#dialog-body').replaceChildren(el('h2', title), ...elements, error);
    $('#confirm-dialog').textContent = confirmText; $('#confirm-dialog').hidden = !submit; $('#cancel-dialog').textContent = submit ? '取消' : '关闭';
    f.onsubmit = e => { e.preventDefault(); execute(async () => {
      error.hidden = true;
      try { await submit(new FormData(f)); }
      catch (failure) {
        if (!d.open) throw failure;
        error.textContent = failure.message; error.hidden = false; return;
      }
      $('#message').hidden = true; d.close(); await refresh();
    }, $('#confirm-dialog')); };
    if (!d.open) d.showModal();
  }
  function tokenDialog(token) {
    dialog('成员激活凭证', [el('p', '请将此凭证交给对应成员，用于首次设置密码。凭证在 24 小时后失效，请妥善保存。'), el('div', token, 'token')], null);
  }
  function showLogin() { me = null; serial++; $('#shell').hidden = $('#unavailable').hidden = true; $('#login').hidden = false; $('#dialog').close(); $('#content').replaceChildren(); }
  async function refresh() {
    try { me = await api('/api/me'); } catch(e) {
      if (e.status !== 401) { serial++; $('#shell').hidden = $('#login').hidden = true; $('#unavailable').hidden = false; $('#unavailable-reason').textContent = e.message; $('#dialog').close(); $('#content').replaceChildren(); }
      throw e;
    }
    $('#login').hidden = $('#unavailable').hidden = true; $('#shell').hidden = false;
    $('#identity').textContent = me.member.display_name;
    const select = $('#scope'); select.replaceChildren();
    if (me.permissions.length) { const o = el('option', '全平台'); o.value = ''; select.append(o); }
    me.workspaces.forEach(w => { const o = el('option', w.name + (w.status === 'archived' ? '（已归档）' : '')); o.value = w.id; select.append(o); });
    if (!Array.from(select.options).some(o => o.value === workspace)) workspace = select.options[0]?.value || '';
    select.value = workspace; await render();
  }
  async function render() {
    const stamp = ++serial, content = $('#content'); $('#title').textContent = names[view];
    document.querySelectorAll('[data-view]').forEach(b => b.classList.toggle('active', b.dataset.view === view));
    content.replaceChildren(el('p', '正在读取…', 'muted'));
    const result = await ({overview, members: memberView, spaces: spaceView, roles: roleView, maintenance: maintenanceView, providers: providerView, audit: auditView}[view])();
    if (stamp === serial) content.replaceChildren(...result);
  }
  function denied() { return [el('div', '当前管理范围未授予此项权限。请选择其他空间或联系管理员。', 'empty')]; }
  function overview() {
    const cards = el('div', undefined, 'metrics');
    for (const [title, number] of [['可管理空间', me.workspaces.length], ['平台权限', me.permissions.length], ['当前范围权限', workspace ? me.workspaces.find(w => w.id === workspace)?.permissions.length || 0 : me.permissions.length]]) {
      const c = el('section', undefined, 'card'); c.append(el('div', title, 'muted'), el('p', number, 'metric')); cards.append(c);
    }
    const note = el('section', undefined, 'card'); note.append(el('h2', '管理协作空间'), el('p', '创建成员和空间，按职责配置角色，再将成员分配到对应空间。角色名称由你定义，实际可执行的操作由权限点决定。'), el('p', '维护中心可设置公告、计划、排空与恢复。供应商迁移、任务处置和画布租约仍在接入中。', 'muted'));
    return [cards, note];
  }
  async function memberView() {
    if (!(workspace ? allowed('space.members.manage') || me.permissions.includes('space.assign') : allowed('member.manage'))) return denied();
    const data = await api(scoped('/api/members', {after: pageAfter}));
    const toolbar = el('div', undefined, 'toolbar');
    if (!workspace) toolbar.append(button('创建成员', () => {
      dialog('创建成员', [field('username', '登录账号'), field('display_name', '显示名称')], async f => {
        const r = await call('/api/members', 'POST', Object.fromEntries(f));
        // Open after the submitted form closes, without storing secrets.
        setTimeout(() => tokenDialog(r.activation_token), 0);
      }, '创建成员');
    }, 'primary'));
    if (workspace || allowed('role.manage')) toolbar.append(button('按账号分配角色', () => {
      dialog('查找已有成员', [field('username', '精确登录账号')], async f => {
        const row = await api(scoped('/api/member-lookup', {username: f.get('username')}));
        setTimeout(() => execute(() => assignDialog(row)), 0);
      }, '查找成员');
    }));
    toolbar.append(button('刷新', refresh));
    const rows = data.members.map(m => {
      const ops = [];
      if (workspace || allowed('role.manage')) ops.push(button('角色', () => assignDialog(m)));
      if (workspace && allowed('space.members.manage')) ops.push(button('撤销空间', () => dialog('撤销空间成员', [el('p', `将撤销 ${m.display_name} 在当前空间的访问资格。其他空间的资格不受影响。`)], () => call(`/api/workspaces/${workspace}/members/${m.id}?expected_version=${m.auth_version}`, 'DELETE'), '确认撤销'), 'danger'));
      if (!workspace) {
        ops.push(button(m.status === 'disabled' ? '启用' : '停用', () => dialog('更改成员状态', [el('p', `${m.display_name}：${m.status === 'disabled' ? '恢复账号访问' : '停用账号并撤销全部登录会话'}。`)], () => call('/api/members/' + m.id, 'PATCH', {status: m.status === 'disabled' ? 'active' : 'disabled'}))));
        ops.push(button('重置密码', () => dialog('重置成员登录', [el('p', `为 ${m.display_name} 生成新激活凭证，旧会话将失效。`)], async () => { const r = await call('/api/members/' + m.id + '/reset', 'POST'); setTimeout(() => tokenDialog(r.activation_token), 0); }, '确认重置')));
        ops.push(button('撤销会话', () => dialog('撤销成员会话', [el('p', `${m.display_name} 将需要重新登录工作台与管理平台。`)], () => call('/api/members/' + m.id + '/revoke-sessions', 'POST'), '确认撤销')));
      }
      return [labelText(m.display_name, m.username), {active: '已激活', invited: '待激活', disabled: '已停用'}[m.status], String(m.role_ids.length), actions(...ops)];
    });
    const pages = el('div', undefined, 'toolbar'); if (pageAfter) pages.append(button('回到首页', () => { pageAfter = ''; return render(); }));
    if (data.next) pages.append(button('下一页', () => { pageAfter = data.next; return render(); }));
    return [toolbar, rows.length ? table(['成员', '状态', '角色数量', '操作'], rows) : el('div', '当前范围还没有成员。', 'empty'), pages];
  }
  async function assignDialog(m) {
    const data = await api(scoped('/api/roles'));
    dialog(`分配角色 · ${m.display_name}`, [el('p', '选中的角色将替换此成员在当前范围内的角色；其他范围保持原有分配。'), choices('roles', data.roles.filter(r => r.active), m.role_ids)], f => call(scoped('/api/members/' + m.id + '/roles'), 'PUT', {role_ids: f.getAll('roles'), expected_version: m.auth_version}));
  }
  async function spaceView() {
    const toolbar = el('div', undefined, 'toolbar');
    if (me.permissions.includes('space.create') && me.permissions.includes('space.assign')) toolbar.append(button('创建空间', () => {
      const description = field('description', '空间说明'); description.querySelector('input').required = false;
      dialog('创建协作空间', [field('name', '空间名称'), description, field('administrator_username', '初始管理员账号', me.member.username)], f => call('/api/workspaces', 'POST', Object.fromEntries(f)), '创建空间');
    }, 'primary'));
    const rows = me.workspaces.map(w => [labelText(w.name, w.id), w.description || '—', w.status === 'active' ? '已启用' : '已归档', actions(
      button('管理此空间', () => { workspace = w.id; view = 'members'; pageAfter = ''; return refresh(); }),
      ...(me.permissions.includes('space.archive') ? [button(w.status === 'active' ? '归档' : '重新启用', () => dialog('更改空间状态', [el('p', `${w.name}：${w.status === 'active' ? '归档后成员将无法访问，已有数据保留' : '恢复成员访问'}。`)], () => call('/api/workspaces/' + w.id, 'PATCH', {archived: w.status === 'active'})))] : [])
    )]);
    return [toolbar, rows.length ? table(['空间', '说明', '状态', '操作'], rows) : el('div', '尚无可管理空间。', 'empty')];
  }
  async function roleView() {
    if (!(workspace ? allowed('space.roles.manage') || allowed('space.members.manage') || me.permissions.includes('space.assign') : allowed('role.manage'))) return denied();
    const data = await api(scoped('/api/roles')), canEdit = allowed(workspace ? 'space.roles.manage' : 'role.manage');
    const toolbar = el('div', undefined, 'toolbar');
    function edit(r) { dialog(r ? '编辑自定义角色' : '创建自定义角色', [field('name', '角色名称', r?.name), el('p', '只能选择你有权授予的权限。', 'muted'), choices('permissions', data.catalog, r?.permissions)], f => call(scoped('/api/roles' + (r ? '/' + r.id : '')), r ? 'PATCH' : 'POST', {name: f.get('name'), permissions: f.getAll('permissions'), ...(r ? {expected_version: r.version} : {})})); }
    if (canEdit) toolbar.append(button('新增角色', () => edit(), 'primary'));
    const rows = data.roles.map(r => [labelText(r.name, r.builtin_key ? '内置模板' : '自定义角色'), r.active ? '启用' : '已停用', r.permissions.length,
      actions(...(canEdit && r.active && !r.builtin_key && r.delegatable ? [button('编辑', () => edit(r)), button('停用', async () => {
        const impact = await api(scoped('/api/roles/' + r.id + '/impact'));
        const l = el('label', '替代方式'), select = el('select'); select.name = 'replacement'; const revoke = el('option', '撤销此角色的全部授予'); revoke.value = ''; select.append(revoke);
        data.roles.filter(t => t.id !== r.id && t.active && t.delegatable && t.builtin_key !== 'superadmin').forEach(t => { const o = el('option', '替换为：' + t.name); o.value = t.id; select.append(o); }); l.append(select);
        dialog('停用角色 · ' + r.name, [el('p', `将影响 ${impact.members.length} 位成员。角色记录将保留供审计。`), el('p', impact.members.map(m => `${m.display_name}（${m.username}）`).join('、') || '暂无已授予成员。', 'details'), l], f => call(scoped('/api/roles/' + r.id + '/retire'), 'POST', {confirmation: impact.confirmation, replacement: f.get('replacement') || null, revoke: !f.get('replacement')}), '确认停用');
      }, 'danger')] : []))]);
    return [toolbar, table(['角色', '状态', '权限数量', '操作'], rows)];
  }
  async function auditView() {
    if (!allowed(workspace ? 'audit.read' : 'audit.platform')) return denied();
    const data = await api(scoped('/api/audit', auditBefore ? {before: auditBefore} : {}));
    const toolbar = el('div', undefined, 'toolbar'); toolbar.append(button('最新记录', () => { auditBefore = ''; return render(); }));
    if (data.next) toolbar.append(button('更早记录', () => { auditBefore = data.next; return render(); }));
    return [toolbar, data.events.length ? table(['时间', '操作人', '操作', '目标', '详情'], data.events.map(e => [new Date(e.created_at).toLocaleString(), e.actor_name || '系统初始化', e.action, labelText(e.target_id || '—', e.workspace_id), el('div', JSON.stringify(e.details), 'details')])) : el('div', '当前范围暂无审计记录。', 'empty')];
  }
  function editProvider(row) {
    const config = row?.config || {}, controls = [];
    const id = field('id', '供应商 ID（创建后固定）', row?.id || '');
    id.querySelector('input').disabled = Boolean(row); id.querySelector('input').maxLength = 40;
    controls.push(id, field('name', '显示名称', config.name || ''), field('base_url', 'API Base URL', config.base_url || '', 'url'));
    const protocolLabel = el('label', '协议'), protocol = el('select'); protocol.name = 'protocol';
    for(const value of ['openai', 'apimart', 'gemini', 'volcengine']) {const option = el('option', value); option.value = value; protocol.append(option);}
    protocol.value = config.protocol || 'openai'; protocolLabel.append(protocol); controls.push(protocolLabel);
    const enabledLabel = el('label', undefined, 'check'), enabled = el('input'); enabled.type = 'checkbox'; enabled.name = 'enabled'; enabled.checked = config.enabled !== false;
    enabledLabel.append(enabled, document.createTextNode('启用供应商（仍需分配到空间才能使用）')); controls.push(enabledLabel);
    for(const [key, label] of [['image_models','图片模型'], ['video_models','视频模型'], ['chat_models','对话模型']]) {
      const holder = el('label', label + '（每行一个）'), input = el('textarea'); input.name = key; input.value = (config[key] || []).join('\n'); holder.append(input); controls.push(holder);
    }
    const advanced = el('details'), details = el('textarea'); details.name = 'advanced';
    const extras = Object.fromEntries(Object.entries(config).filter(([key]) => !['id','name','base_url','protocol','enabled','image_models','video_models','chat_models'].includes(key)));
    details.value = JSON.stringify(extras, null, 2); const advancedLabel = el('label', '高级配置 JSON'); advancedLabel.append(details);
    advanced.append(el('summary', '高级配置：端口、代理、模型价格与协议覆盖'), advancedLabel); controls.push(advanced);
    for(const [key, label] of [['api_key','API Key'], ['volcengine_access_key_id','火山素材 AK'], ['volcengine_secret_access_key','火山素材 SK']]) {
      const input = field(key, label + ((row?.configured_secrets || []).includes(key) ? '（已配置，留空保留）' : '（尚未配置）'), '', 'password');
      input.querySelector('input').required = false; input.querySelector('input').maxLength = 8192; input.querySelector('input').autocomplete = 'off';
      const clear = el('label', undefined, 'check'), check = el('input'); check.type = 'checkbox'; check.name = 'clear_' + key;
      clear.append(check, document.createTextNode('清除 ' + label)); controls.push(input, clear);
    }
    const reason = field('reason', '操作原因'); reason.querySelector('input').maxLength = 1000; controls.push(reason);
    dialog(row ? '编辑供应商 · ' + config.name : '新增供应商', [el('p', '配置由全平台共享。凭证只写入，不回显；修改账号或接口后，原任务可能需要核对。'), ...controls], form => {
      let extra; try {extra = JSON.parse(form.get('advanced'));} catch {throw new Error('高级配置不是有效 JSON。');}
      if(!extra || Array.isArray(extra) || typeof extra !== 'object') throw new Error('高级配置应为 JSON 对象。');
      const next = {...extra, name: form.get('name'), base_url: form.get('base_url'), protocol: form.get('protocol'), enabled: form.has('enabled')};
      for(const key of ['image_models','video_models','chat_models']) next[key] = String(form.get(key)).split(/\r?\n/).map(value => value.trim()).filter(Boolean);
      const secrets = {}, clear_secrets = [];
      for(const key of ['api_key','volcengine_access_key_id','volcengine_secret_access_key']) {if(form.get(key)) secrets[key] = form.get(key); if(form.has('clear_' + key)) clear_secrets.push(key);}
      return call('/api/providers/' + encodeURIComponent(row?.id || form.get('id')), 'PUT', {config: next, expected_version: row?.version || 0, secrets, clear_secrets, reason: form.get('reason')});
    });
  }
  const probeMessages = {
    models_available: '模型列表接口可用。请核对分类，勾选需要追加的模型。', models_empty: '模型列表接口已响应，但没有可导入的模型；请检查配置或手动填写模型。',
    upstream_redirect: '接口返回跳转。请核对已保存的 API Base URL。',
    upstream_auth_rejected: '供应商拒绝了凭证，请核对 API Key 和供应商账号权限。',
    upstream_models_unavailable: '供应商不支持此模型列表入口。可核对协议或手动配置模型；本次不能确认生成能力。',
    upstream_rate_limited: '供应商限流，请稍后重试。', upstream_error: '供应商接口返回错误，请稍后重试。',
    upstream_response_too_large: '模型列表响应过大，请手动配置所需模型。', upstream_invalid_response: '返回内容不是支持的模型列表，请核对接口地址。',
    upstream_timeout: '连接检测超时，请检查地址、代理或网络后重试。', upstream_connection_failed: '无法连接供应商，请检查地址、代理和网络。'
  };
  function probeProvider(row) {
    const scopeStamp = serial, memberId = me.member.id, resultBox = el('div'), reason = field('reason', '检测与导入原因');
    reason.querySelector('input').maxLength = 1000;
    let discovered = null;
    const current = () => resultBox.isConnected && $('#dialog').open && serial === scopeStamp && me?.member.id === memberId;
    const probeButton = button('开始检测并拉取模型', async () => {
      const input = reason.querySelector('input'); if(!input.reportValidity()) return;
      discovered = null; $('#confirm-dialog').hidden = true; resultBox.replaceChildren(el('p', '正在检测已保存的配置…'));
      try {
        const result = await call('/api/providers/' + encodeURIComponent(row.id) + '/probe', 'POST', {expected_version: row.version, reason: input.value});
        if(!current()) return;
        resultBox.replaceChildren(el('p', probeMessages[result.code] || '检测未完成。', result.ok ? '' : 'error'));
        resultBox.append(el('p', 'HTTP ' + (result.status || '—') + ' · ' + result.elapsed_ms + ' ms', 'muted'));
        if(result.truncated) resultBox.append(el('p', '这里只显示部分模型；请核对供应商列表，其他模型可手动填写。', 'muted'));
        if(result.filtered) resultBox.append(el('p', '已忽略不符合模型标识格式的内容。', 'muted'));
        if(!result.ok || !result.model_count) return;
        discovered = result;
        resultBox.append(el('p', '分类按模型名称推测，可在编辑供应商时调整。确认后追加到现有列表，模型费用需另行配置。'));
        for(const [key, label] of [['image_models','图片模型'], ['video_models','视频模型'], ['chat_models','对话模型']]) {
          if(result[key]?.length) resultBox.append(el('h3', label + ' · ' + result[key].length), choices(key, result[key].map(id => ({id, name: id + ((row.config[key] || []).includes(id) ? '（已配置）' : '')}))));
        }
        $('#confirm-dialog').hidden = false;
      } catch(error) {
        if(current()) resultBox.replaceChildren(el('p', error.message, 'error'));
      }
    });
    dialog('检测与模型 · ' + row.config.name, [el('p', '使用已保存的地址、协议、代理和凭证访问模型列表。检测结果不代表生成已验证，拉取不会自动修改配置。'), reason, probeButton, resultBox], form => {
      if(!discovered || !current()) throw new Error('请先重新检测供应商。');
      const config = Object.fromEntries(Object.entries(row.config).filter(([key]) => !['id','model_prices'].includes(key)));
      let selected = 0;
      for(const key of ['image_models','video_models','chat_models']) {
        const picked = form.getAll(key); selected += picked.length;
        config[key] = [...new Set([...(config[key] || []), ...picked])];
        if(config[key].length > 500) throw new Error('每类最多保留 500 个模型，请减少选择。');
      }
      if(!selected) throw new Error('请勾选需要追加的模型。');
      return call('/api/providers/' + encodeURIComponent(row.id), 'PUT', {expected_version: discovered.version, config, reason: form.get('reason')});
    }, '追加所选模型', true);
    $('#confirm-dialog').hidden = true;
  }
  async function providerView() {
    if(!me.permissions.includes('provider.configure')) return denied();
    const scope = workspace;
    const [data, assigned] = await Promise.all([api('/api/providers'), scope ? api('/api/provider-assignments?workspace=' + encodeURIComponent(scope)) : Promise.resolve(null)]);
    const toolbar = el('div', undefined, 'toolbar'); toolbar.append(button('新增供应商', () => editProvider(), 'primary'), button('刷新配置', refresh));
    if(scope && me.permissions.includes('space.assign')) toolbar.append(button('分配到本空间', () => {
      const primaryLabel = el('label', '默认供应商'), primary = el('select'); primary.name = 'primary';
      const none = el('option', '不指定默认'); none.value = ''; primary.append(none);
      data.providers.forEach(row => {const option = el('option', row.config.name); option.value = row.id; primary.append(option);});
      primary.value = assigned.primary_provider_id || ''; primaryLabel.append(primary);
      const reason = field('reason', '分配原因'); reason.querySelector('input').maxLength = 1000;
      dialog('分配供应商 · ' + me.workspaces.find(item => item.id === scope)?.name, [el('p', '取消分配后不能发起新的供应商调用。已提交任务可凭原账号继续查询；账号变化时仍需人工核对。'),
        choices('provider_ids', data.providers.map(row => ({id: row.id, name: row.config.name + (row.config.enabled ? '' : '（已停用）')})), assigned.provider_ids), primaryLabel, reason],
        form => call('/api/provider-assignments?workspace=' + encodeURIComponent(scope), 'PUT', {provider_ids: form.getAll('provider_ids'), primary_provider_id: form.get('primary') || null, expected_version: assigned.version, reason: form.get('reason')}));
    }));
    const rows = data.providers.map(row => [labelText(row.config.name, row.id), row.config.protocol, row.config.enabled ? '启用' : '停用',
      row.configured_secrets.length ? '已配置 ' + row.configured_secrets.length + ' 项凭证' : '尚未配置凭证',
      scope ? assigned.provider_ids.includes(row.id) ? assigned.primary_provider_id === row.id ? '已分配 · 默认' : '已分配' : '未分配' : '请选择空间查看分配',
      actions(button('编辑 · ' + row.config.name, () => editProvider(row)), button('检测与模型 · ' + row.config.name, () => probeProvider(row)))]);
    return [el('p', '供应商配置由平台管理员维护，成员仅能使用分配到所在空间的服务。'), toolbar,
      rows.length ? table(['供应商', '协议', '状态', '凭证', '空间分配', '操作'], rows) : el('p', '尚未配置供应商。新增并分配后，成员才能选择模型。')];
  }
  const reviewOutcomes = {member_confirmed_saved: '已向成员确认保存', draft_exported: '已确认草稿导出', member_discarded: '成员确认无需保留'};
  async function showPageReports(reviewed = false, after = '', scope = workspace) {
    const stamp = serial, request = ++reportRequest, memberId = me?.member.id;
    const params = new URLSearchParams({reviewed: String(reviewed)});
    if (scope) params.set('workspace', scope);
    if (after) params.set('after', after);
    const data = await api('/api/maintenance/page-reports?' + params);
    if (stamp !== serial || request !== reportRequest || memberId !== me?.member.id || scope !== workspace || view !== 'maintenance') return;
    const toolbar = el('div', undefined, 'toolbar');
    toolbar.append(button('返回首批', () => showPageReports(reviewed, '', scope)));
    if (data.next) toolbar.append(button('下一批', () => showPageReports(reviewed, data.next, scope)));
    const rows = data.reports.map(row => {
      const state = row.closed ? '关闭时未保存' : row.dirty ? '失联 · 最后报告未保存' : '失联 · 最后报告已保存';
      const result = el('div');
      if (row.reviewed_at) result.append(el('p', (reviewed ? '' : '此前核对：') + reviewOutcomes[row.review_outcome]),
        el('p', row.review_note, 'details'), el('small', row.reviewer_name + ' · ' + new Date(row.reviewed_at).toLocaleString()));
      if (!reviewed) result.append(button('核对 · ' + row.canvas_title, () => {
        const label = el('label', '核对结果'), select = el('select'); select.name = 'outcome'; select.required = true;
        const placeholder = el('option', '请选择实际核对结果'); placeholder.value = ''; select.append(placeholder);
        Object.entries(reviewOutcomes).forEach(([value, text]) => { const option = el('option', text); option.value = value; select.append(option); }); label.append(select);
        const note = el('label', '处理说明'), text = el('textarea'); text.name = 'note'; text.required = true; text.maxLength = 1000; note.append(text);
        const query = scope ? '?workspace=' + encodeURIComponent(scope) : '';
        dialog('核对页面 · ' + row.canvas_title, [el('p', row.workspace_name + ' · ' + row.member_name + ' · ' + state),
          el('p', '请先与成员核实。此操作只记录本次报告的处理结论，不会保存或删除草稿，也不代表可以停止数据库。'), label, note],
          form => call('/api/maintenance/page-reports/' + row.id + '/review' + query, 'POST', {
            expected_sequence: row.sequence, outcome: form.get('outcome'), note: form.get('note')
          }), '记录核对结果');
      }));
      return [labelText(row.canvas_title, row.workspace_name), labelText(row.member_name, row.member_id),
        new Date(row.seen_at).toLocaleString(), state, result];
    });
    dialog(reviewed ? '已核对的页面报告' : '待核对的页面报告', [el('p', '仅列出失联或关闭时未保存的页面。新报告会重新判定，旧核对不覆盖新状态。'), toolbar,
      rows.length ? table(['画布 / 空间', '成员', '最后报告', '报告状态', '核对结果'], rows) : el('p', '当前范围暂无此类报告。')], null, '确认保存', true);
  }
  async function maintenanceView() {
    if (!allowed(workspace ? 'maintenance.space' : 'maintenance.platform')) return denied();
    const data = await api(scoped('/api/maintenance')), control = data.control, activity = data.activity;
    const modes = {normal: '正常开放', scheduled: '已计划维护', draining: '排空中', read_only: '只读', offline: '暂停访问', recovering: '恢复检查中'};
    const transitions = {normal: ['scheduled', 'draining'], scheduled: ['normal', 'draining'], draining: ['read_only', 'offline', 'recovering'], read_only: ['offline', 'recovering'], offline: ['recovering'], recovering: ['normal', 'offline', 'read_only']};
    const scopeName = workspace ? me.workspaces.find(w => w.id === workspace)?.name : '全平台';
    const summary = el('section', undefined, 'card');
    summary.append(el('h2', scopeName + ' · ' + modes[control.mode]), el('p', '成员当前限制：' + modes[data.effective.mode]), el('p', data.effective.message || '暂无维护公告。', 'muted'));
    if (control.planned_at) summary.append(el('p', '计划开始：' + new Date(control.planned_at).toLocaleString()));
    if (data.effective.drain_deadline) summary.append(el('p', '已有编辑和上传收尾截止：' + new Date(data.effective.drain_deadline).toLocaleString()));
    if (workspace) summary.append(el('p', '本空间恢复不会解除仍有效的平台维护。', 'muted'));
    const toolbar = el('div', undefined, 'toolbar');
    toolbar.append(button('刷新状态', refresh), button('更改维护状态', () => {
      const modeLabel = el('label', '目标状态'), select = el('select'); select.name = 'mode';
      [control.mode, ...transitions[control.mode]].forEach(mode => { const option = el('option', modes[mode]); option.value = mode; select.append(option); }); modeLabel.append(select);
      const message = field('message', '向成员展示的公告', control.message); message.querySelector('input').required = false; message.querySelector('input').maxLength = 1000;
      const reason = field('reason', '操作原因'); reason.querySelector('input').maxLength = 1000;
      const planned = field('planned_at', '计划开始时间（本地时间）', '', 'datetime-local'); planned.querySelector('input').required = false;
      const grace = field('grace_seconds', '已有编辑和上传收尾宽限（秒，最长 3600）', String(control.grace_seconds), 'number'); grace.querySelector('input').min = '0'; grace.querySelector('input').max = '3600';
      const confirm = el('label', undefined, 'check'), check = el('input'); check.type = 'checkbox'; check.name = 'confirm_recovery'; confirm.append(check, document.createTextNode('已完成运行、数据和备份检查，确认恢复开放'));
      select.onchange = () => { planned.hidden = select.value !== 'scheduled'; planned.querySelector('input').required = select.value === 'scheduled'; confirm.hidden = !(control.mode === 'recovering' && select.value === 'normal'); };
      select.onchange();
      dialog('更改维护 · ' + scopeName, [el('p', `当前有 ${activity.canvas_locks ?? '未知数量的'} 个画布占用、${activity.active_tasks} 个执行中任务、${activity.queued_tasks} 个排队任务。更改访问限制不会取消已提交任务或替成员保存未上传内容。`), modeLabel, message, reason, planned, grace, confirm], f => call(scoped('/api/maintenance'), 'PATCH', {
        mode: f.get('mode'), expected_version: control.version, message: f.get('message'), reason: f.get('reason'),
        planned_at: f.get('mode') === 'scheduled' ? new Date(f.get('planned_at')).toISOString() : null,
        grace_seconds: Number(f.get('grace_seconds')), confirm_recovery: f.has('confirm_recovery')
      }), '确认更改');
    }, 'primary'));
    const metrics = el('div', undefined, 'metrics');
    for (const [title, number] of [['执行中任务', activity.active_tasks], ['等待提交', activity.queued_tasks], ['待核对任务', activity.needs_review], ['未完成上传', activity.uploads.pending], ['有效画布占用', activity.canvas_locks ?? '未知'], ['在线页未保存', activity.unsaved_pages ?? '未知']]) {
      const card = el('div', undefined, 'card'); card.append(el('div', title, 'muted'), el('p', number, 'metric')); metrics.append(card);
    }
    const services = el('section', undefined, 'card'); services.append(el('h2', '服务与发布检查'));
    for (const [kind, name] of [['workbench', '工作台服务'], ['worker', '任务消费者']]) { const row = activity.services.find(s => s.kind === kind); services.append(el('p', name + '：' + (row?.online ? '有在线心跳' : '当前无有效在线心跳'))); }
    services.append(el('p', '画布占用不代表草稿已保存。页面报告只覆盖已上报的页面，失联页面与旧客户端仍需核对；即使计数为零，也不能据此确认可以停止数据库或发布服务。已有付费任务仍可能写入结果与费用。', 'muted'));
    const pages=el('section',undefined,'card'), reports=activity.page_reports;
    pages.append(el('h2','页面保存报告'));
    if(reports) pages.append(el('p',`在线上报 ${reports.online_pages} 页；失联 ${reports.stale_pages} 页，其中最后报告未保存 ${reports.stale_unsaved_pages} 页；关闭时未保存 ${reports.closed_unsaved_pages} 页。`),
      el('p',`超过 ${reports.stale_after_seconds} 秒未收到报告或成员授权已失效的页面列为失联。报告不包含草稿正文，后台不能代替成员保存。`,'muted'));
    else pages.append(el('p','页面报告暂不可用，不能据此确认已保存。'));
    if(reports) pages.append(el('p', '待人工核对 ' + reports.pending_review_pages + ' 页；当前报告已核对 ' + reports.reviewed_pages + ' 页。核对后保留原报告状态。'),
      actions(button('查看待核对页面', () => showPageReports()), button('查看已核对页面', () => showPageReports(true))));
    return [summary, toolbar, metrics, pages, services];
  }
  $('#cancel-dialog').onclick = () => $('#dialog').close();
  $('#scope').onchange = () => execute(() => { workspace = $('#scope').value; pageAfter = auditBefore = ''; return render(); });
  document.querySelectorAll('[data-view]').forEach(b => b.onclick = () => execute(() => { view = b.dataset.view; pageAfter = auditBefore = ''; return render(); }, b));
  $('#logout').onclick = () => execute(async () => { await call('/api/auth/logout', 'POST'); showLogin(); });
  $('#unavailable-logout').onclick = $('#logout').onclick;
  $('#retry').onclick = () => execute(refresh);
  $('#login-form').onsubmit = e => { e.preventDefault(); execute(async () => {
    const f = new FormData(e.target); await call('/api/auth/login', 'POST', {username: f.get('username'), password: f.get('password'), remember: f.has('remember')});
    e.target.reset(); $('#message').hidden = true; await refresh();
  }, e.target.querySelector('button')); };
  refresh().catch(e => { if (e.status !== 401) notice(e.message, true); });
})();
