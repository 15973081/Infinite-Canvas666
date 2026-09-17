(() => {
  'use strict';
  const $ = (s) => document.querySelector(s);
  let me, view = 'overview', workspace = '', pageAfter = '', auditBefore = '', taskStatus = 'needs_review', taskAfter = '', backupAfter = '', occupancyAfter = '', serial = 0, reportRequest = 0;
  const names = {modelBilling:'模型与计费',billing:'账号费用',databases: '数据库连接', overview: '概览', members: '成员与分配', spaces: '空间', roles: '角色与权限', maintenance: '维护中心', providers: '供应商与分配', audit: '操作审计', tasks: '任务处置', backups: '备份记录', occupancy: '画布占用'};
  const errors = {
    invalid_model_policy:'请检查模型开关、开放规格和视频秒数范围（正整数，最短不大于最长）。',
    invalid_model_discount:'折扣支付比例须为 0–100%，结束时间须晚于开始时间，同一规格的时段不能重叠；交叉规格必须有明确包含关系，具体规格覆盖通用规则。',
    invalid_provider_prices:'价格配置无效，请检查金额、规格和计费单位。',
    billing_assignment_changed:'流水或归属已变化，请重新预览。',billing_target_unavailable:'目标账号不是本空间的有效成员。',billing_reason_required:'请填写补录原因。',billing_assignment_empty:'没有需要调整的流水。',billing_assignment_too_large:'该画布流水超过 2000 条，请联系维护人员分批处理。',invalid_billing_query:'请检查日期范围。',
    invalid_database_config: '请检查数据库地址、端口和必填信息；地址只填主机名或 IP。',
    invalid_database_certificate: '请粘贴有效的 PEM 格式 CA 证书，不要填写私钥。',
    database_password_required: '首次创建连接需要填写密码。',
    database_connection_changed: '连接配置已被修改，请刷新后重试。',
    database_connection_not_found: '该连接已被删除，请刷新列表。',
    invalid_tos_config: '请检查桶名称与地域。',
    invalid_tos_endpoint: '请填写与地域一致的官方 TOS HTTPS Endpoint。',
    tos_credentials_required: '首次配置请填写 AK 和 SK；替换凭证时两者必须一起填写。',
    tos_config_changed: '配置已变更，请关闭后重新打开。',
    canvas_occupancy_changed:'画布已保存、被接管或占用已失效，请关闭弹窗并刷新列表后重新确认。',
    canvas_occupancy_confirmation_required:'请填写原因并明确确认结束当前占用。',
    canvas_not_found:'当前空间中找不到此画布，请刷新。',
    backup_storage_unconfigured:'运维尚未配置有效的备份目录。',
    backup_already_pending:'当前范围已有排队或执行中的备份，请刷新记录。',
    backup_request_conflict:'此请求编号已用于其他备份，请重新打开。',
    invalid_backup_request:'请填写备份说明并核对空间。',
    authentication_required: '登录已失效，请重新登录。', management_permission_required: '此账号尚未获授管理权限。',
    invalid_credentials: '账号或密码不正确。', login_rate_limited: '登录尝试过多，请稍后重试。',
    permission_denied: '当前账号没有此项权限。', cannot_delegate_permission: '不能授予超出你权限范围的角色。',
    protected_administrator: '此管理员账号受到保护。', builtin_role_protected: '内置角色不能修改，请新建自定义角色。',
    last_platform_administrator: '平台必须保留至少一位有效超级管理员。', last_workspace_administrator: '启用的空间必须保留至少一位有效管理员。',
    member_version_conflict: '成员授权已发生变化，请刷新后重新选择。', role_version_conflict: '角色已被修改，请刷新后重试。',
    role_impact_changed: '受影响成员已变化，请重新预览。', member_not_found: '未找到此成员。',
    workspace_unavailable: '空间已归档或不可访问。', username_exists: '账号已存在。', role_name_exists: '此范围内已有同名角色。',
    active_administrator_required: '请填写已激活成员的登录账号。',
    provider_import_source_unconfigured: '尚未指定旧配置文件，请由维护人员配置来源路径。',
    provider_import_source_unavailable: '无法读取指定的旧配置文件，请由维护人员检查。',
    provider_import_source_too_large: '旧配置文件超过 2 MiB，请拆分后重试。',
    provider_import_source_invalid: '旧配置格式不正确，应为最多 100 项的供应商列表。',
    provider_import_source_changed: '旧配置或凭证文件已变化，请重新预览。',
    provider_import_target_changed: '所选供应商已存在或不再可导入，请重新预览。',
    provider_import_expired: '导入预览已过期，请重新读取。',
    provider_import_not_found: '找不到此会话的导入预览，请重新读取。',
    provider_import_selection_changed: '此预览已经完成另一组导入，请重新读取。',
    invalid_provider_import: '请选择有效的供应商及对应凭证。',
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
    task_review_not_found:'未找到当前空间内的任务。',
    task_review_changed:'任务状态已变化，请关闭后重新核对。',
    task_review_busy:'任务仍有有效执行占用，请等待执行结束后刷新。',
    task_review_action_unavailable:'任务当前不满足此操作条件，请重新核对结果来源和原账号。',
    task_review_request_conflict:'此请求已用于其他处置，请重新打开任务记录。',
    task_upstream_confirmation_required:'请先确认已向供应商核实结果。',
    invalid_task_review:'请选择处置方式并填写核对依据。',
    invalid_task_review_query:'任务筛选条件不正确，请刷新。',
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
        if (!error.isConnected || !d.open) return;
        error.textContent = failure.message; error.hidden = false; return;
      }
      if (!error.isConnected || !d.open) return;
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
    const result = await ({modelBilling:modelBillingView,billing: billingView, databases: databaseView, overview, members: memberView, spaces: spaceView, roles: roleView, maintenance: maintenanceView, providers: providerView, audit: auditView, tasks: taskView, backups: backupView, occupancy: occupancyView}[view])();
    if (stamp === serial) content.replaceChildren(...result);
  }
  async function modelBillingView(){
    if(!allowed('provider.configure'))return denied();
    const reload=()=>api('/api/providers');
    const data=await reload();
    return [await window.ManagementModelBilling.create({catalog:{...data,reload},save:(row,body)=>api('/api/providers/'+encodeURIComponent(row.id),{method:'PUT',body:JSON.stringify(body)})})];
  }
  async function billingView(){
    if(!allowed(workspace?'billing.read':'billing.platform'))return denied();
    const scope=workspace,canAssign=scope&&(allowed('billing.assign')||me.permissions.includes('billing.assign.platform'));
    const assignmentApi=canAssign?(path,options)=>{const [route,extra]=path.split('&');return api('/api/billing/'+route+'?workspace='+encodeURIComponent(scope)+(extra?'&'+extra:''),options);}:null;
    const hint=!scope&&me.permissions.includes('billing.assign.platform')?[el('p','补录整张画布的账单，请先在右上角管理范围选择具体空间。','muted')]:[];
    return [...hint,await window.CanvasBillingUI.create({assignmentApi,fetchReport:params=>api('/api/billing?'+new URLSearchParams({...params,...(scope?{workspace:scope}:{})}))})];
  }
  function denied() { return [el('div', '当前管理范围未授予此项权限。请选择其他空间或联系管理员。', 'empty')]; }
  function overviewBytes(value) {
    if (value == null) return '未授权';
    const bytes = BigInt(value), units = ['B', 'KiB', 'MiB', 'GiB', 'TiB', 'PiB', 'EiB'];
    let divisor = 1n, unit = 0;
    while (bytes >= divisor * 1024n && unit < units.length - 1) { divisor *= 1024n; unit++; }
    const tenths = bytes * 10n / divisor;
    return unit ? String(tenths / 10n) + '.' + String(tenths % 10n) + ' ' + units[unit] : String(bytes) + ' B';
  }
  function overviewMetric(title, value, detail) {
    const card = el('section', undefined, 'card');
    card.append(el('h2', title), el('p', value == null ? '未授权' : String(value), 'metric'));
    if (detail) card.append(el('p', detail, 'muted'));
    return card;
  }
  async function overview() {
    const scope = workspace, stamp = serial, memberId = me?.member.id;
    const current = () => workspace === scope && serial === stamp && me?.member.id === memberId;
    let data;
    try { data = await api('/api/overview' + (scope ? '?' + new URLSearchParams({workspace: scope}) : '')); }
    catch (error) {
      if (!current()) return [];
      const failed = el('section', undefined, 'card');
      failed.append(el('h2', '概览暂不可用'), el('p', error.message), button('重试读取', refresh));
      return [failed];
    }
    if (!current()) return [];
    if ((data.workspace?.id || '') !== scope) throw new Error('概览范围已变化，请刷新后重试。');
    const toolbar = el('div', undefined, 'toolbar');
    toolbar.append(button('刷新概览', refresh), el('span', '更新于 ' + new Date(data.observed_at).toLocaleString(), 'muted'));
    const summary = el('section', undefined, 'card');
    summary.append(el('h2', data.workspace?.name || '平台概览'), el('p', scope ? '查看当前空间的资源和运行状态。各项数据按你的权限展示。' : '选择具体空间查看画布、素材容量与任务统计。'));
    if (data.workspace?.status === 'archived') {
      summary.append(el('p', '此空间已归档，资源统计暂停展示。已有数据仍保留。', 'muted'));
      return [toolbar, summary];
    }
    const cards = el('div', undefined, 'metrics');
    if (!scope) cards.append(overviewMetric('可管理空间', data.manageable_spaces));
    cards.append(overviewMetric(scope ? '空间成员' : '平台成员', data.members?.total,
      data.members ? '已激活 ' + data.members.active + ' · 待激活 ' + data.members.invited + ' · 已停用 ' + data.members.disabled : '需要成员管理权限。'));
    if (scope) {
      cards.append(overviewMetric('画布', data.canvases?.total, data.canvases ? '经典 ' + data.canvases.classic + ' · 智能 ' + data.canvases.smart + ' · 回收站 ' + data.canvases.recycled : '需要画布读取权限。'));
      cards.append(overviewMetric('素材原件', data.assets?.originals, data.assets ? '派生预览 ' + data.assets.previews + ' 份' : '需要素材读取权限。'));
      cards.append(overviewMetric('已登记素材容量', data.assets ? overviewBytes(data.assets.ready_bytes) : null,
        '已就绪原件与预览的合计；未完成上传、内部缓存和备份不在其中，实际磁盘占用可能更高。'));
      cards.append(overviewMetric('任务总数', data.tasks?.total, data.tasks ? '排队 ' + data.tasks.queued + ' · 执行中 ' + data.tasks.active + ' · 待核对 ' + data.tasks.needs_review : '需要任务核对权限。'));
    }
    const maintenance = el('section', undefined, 'card'); maintenance.append(el('h2', '维护与服务'));
    const modes = {normal:'正常开放',scheduled:'已计划维护',draining:'正在排空',read_only:'只读',offline:'暂停访问',recovering:'恢复检查'};
    if (data.maintenance) {
      maintenance.append(el('p', modes[data.maintenance.mode] || data.maintenance.mode));
      if (data.maintenance.message) maintenance.append(el('p', data.maintenance.message));
      if (data.maintenance.planned_at) maintenance.append(el('p', '计划时间：' + new Date(data.maintenance.planned_at).toLocaleString(), 'muted'));
      if (data.maintenance.drain_deadline) maintenance.append(el('p', '收尾截止：' + new Date(data.maintenance.drain_deadline).toLocaleString(), 'muted'));
      const services = data.services || [];
      if (!services.length) maintenance.append(el('p', '尚无业务服务心跳记录。', 'muted'));
      services.forEach(service => maintenance.append(el('p', (service.kind === 'workbench' ? '工作台' : '生成执行服务') + '：在线 ' + service.online + ' · 失联未确认 ' + service.unknown + ' · 已记录停止 ' + service.stopped)));
      maintenance.append(el('p', '服务心跳反映最近上报状态。维护发布前仍需完成维护中心的逐项核对。', 'muted'), button('打开维护中心', () => { view='maintenance'; return render(); }));
    } else maintenance.append(el('p', '未授权，需要当前范围的维护权限。', 'muted'));
    const backup = el('section', undefined, 'card'); backup.append(el('h2', '最近备份'));
    if (data.backup) {
      const latest=data.backup.latest, states={queued:'排队中',running:'执行中',succeeded:'成功',failed:'失败',cancelled:'已取消'};
      backup.append(el('p', '记录 ' + data.backup.total + ' · 待完成 ' + data.backup.pending));
      backup.append(el('p', latest ? (states[latest.status] || latest.status) + ' · ' + new Date(latest.completed_at || latest.created_at).toLocaleString() : '尚无备份记录。', 'muted'));
      backup.append(button('查看备份记录', () => { view='backups'; backupAfter=''; return render(); }));
    } else backup.append(el('p', '未授权，需要当前范围的备份读取权限。', 'muted'));
    return [toolbar, summary, cards, maintenance, backup];
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
      button('资源概览', () => { workspace = w.id; view = 'overview'; return refresh(); }),
      button('管理此空间', () => { workspace = w.id; view = 'members'; pageAfter = ''; return refresh(); }),
      ...(me.permissions.includes('space.archive') ? [button(w.status === 'active' ? '归档' : '重新启用', () => dialog('更改空间状态', [el('p', `${w.name}：${w.status === 'active' ? '归档后成员将无法访问，已有数据保留' : '恢复成员访问'}。`)], () => call('/api/workspaces/' + w.id, 'PATCH', {archived: w.status === 'active'})))] : [])
    )]);
    return [toolbar, rows.length ? table(['空间', '说明', '状态', '操作'], rows) : el('div', '尚无可管理空间。', 'empty')];
  }
  async function databaseView() {
    if (workspace || !me.permissions.includes('maintenance.platform')) return denied();
    const data = await api('/api/database-connections');
    const intro = el('section', undefined, 'card');
    intro.append(el('h2', 'PostgreSQL 连接'), el('p', '集中管理连接信息，测试网络、账号及证书。'), el('p', '保存配置不会切换当前服务。删除仅移除连接配置，不会删除远端数据库或表。', 'muted'));
    const toolbar = actions(button('新增连接', () => databaseEdit(), 'primary'), button('刷新', render));
    const cards = el('div', undefined, 'database-grid');
    for (const item of data.items) {
      const card = el('section', undefined, 'card'), c = item.config, result = el('div', undefined, 'database-result');
      result.setAttribute('aria-live', 'polite');
      card.append(el('h2', c.name), el('p', c.host + ':' + c.port), el('p', c.database + ' / ' + c.schema_name + ' · ' + c.username, 'muted'), el('p', 'TLS 证书校验 · 密码已加密保存', 'muted'));
      card.append(actions(button('查看', () => databaseDetails(item)), button('编辑', () => databaseEdit(item)), button('测试连接', async () => {
        result.replaceChildren(el('p', '正在连接…'));
        try { const r = await call('/api/database-connections/' + item.id + '/probe', 'POST', {expected_version:item.version});
          result.replaceChildren(el('p', r.state === 'connected' ? '连接成功 · PostgreSQL ' + r.server_version + ' · ' + r.tls + ' · 可见表 ' + r.tables + ' 张' : r.message, r.state === 'connected' ? 'database-success' : 'dialog-error'));
        } catch(e) { result.replaceChildren(el('p', e.message, 'dialog-error')); }
      }), button('删除', () => dialog('删除连接配置', [el('p', '删除“' + c.name + '”的已保存连接信息？远端数据库和表保持不变。')], () => call('/api/database-connections/' + item.id, 'DELETE', {expected_version:item.version}), '删除配置'), 'danger')) , result);
      cards.append(card);
    }
    if (!data.items.length) cards.append(el('div', '尚未添加数据库连接。点击“新增连接”开始配置。', 'empty'));
    return [intro, toolbar, cards];
  }
  function databaseDetails(item) {
    const c=item.config;
    dialog('连接详情 · ' + c.name, [table(['配置项','值'], [['主机',c.host],['连接 IP（可选）',c.hostaddr || '使用 DNS 解析'],['端口',c.port],['数据库',c.database],['Schema',c.schema_name],['账号',c.username],['密码','已加密保存，不回显'],['TLS','verify-full：校验 CA 与主机名'],['更新时间',new Date(item.updated_at).toLocaleString()]] )],null,'确认保存',true);
  }
  function databaseEdit(item) {
    const c=item?.config || {}, grid=el('div',undefined,'tos-fields');
    const specs=[['name','连接名称',''],['host','数据库主机名',''],['port','端口','5432'],['database','数据库名','canvans'],['username','数据库账号',''],['schema_name','Schema','canvas_cloud'],['hostaddr','连接 IP（可选）','']];
    specs.forEach(([name,label,value])=>{
      const f=field(name,label,c[name] ?? value,name==='port' ? 'number':'text'), i=f.querySelector('input'); i.required=name!=='hostaddr'; i.maxLength=name==='host' ? 253 : name==='name' ? 100 : 63; if(name==='port'){i.min='1';i.max='65535';} grid.append(f);
    });
    const pw=field('password','数据库密码','','password'), pi=pw.querySelector('input'); pi.required=!item;pi.maxLength=1024;pi.autocomplete='new-password';pi.placeholder=item ? '留空保留原密码' : '仅加密保存，不会回显';grid.append(pw);
    const ca=el('label','CA 证书（PEM）'), area=el('textarea');area.name='ca_pem';area.required=true;area.maxLength=65536;area.rows=5;area.value=c.ca_pem || '';area.placeholder='-----BEGIN CERTIFICATE-----';ca.append(area);
    dialog(item ? '编辑数据库连接' : '新增数据库连接', [el('p','连接测试从管理服务器发起，请在数据库白名单中放行管理服务器的出口 IP。','muted'),grid,el('p','通常只需主机名；连接 IP 可留空。指定 IP 时仍按主机名验证证书。','muted'),ca], form=>{
      const payload=Object.fromEntries(form.entries());payload.port=Number(payload.port);payload.expected_version=item?.version || 0;
      return call('/api/database-connections' + (item ? '/' + item.id : ''),item ? 'PUT' : 'POST',payload);
    },'保存连接',true);
  }
  async function storageDialog() {
    const data = await api('/api/storage/tos');
    const status = el('section', undefined, 'tos-status');
    status.append(el('h3', '对象存储 · TOS'), el('p', '当前后端：' + data.active_backend + ' · ' + (data.version ? '已保存待启用配置' : '尚未配置')), el('p', '保存后用于连接检查。完成现有素材迁移并统一更新工作台与任务服务配置后，才能启用云端存储。', 'muted'));
    const fields = [['bucket', '桶名称', 'canvas-media'], ['region', '地域', 'cn-beijing'], ['internal_endpoint', '服务端 Endpoint', 'https://tos-cn-beijing.volces.com'], ['public_endpoint', '浏览器 / 模型 Endpoint', 'https://tos-cn-beijing.volces.com']].map(([name, label, value]) => {
      const control = field(name, label, data.config[name] || value);
      control.querySelector('input').maxLength = 200; return control;
    });
    const secrets = [['access_key', 'Access Key'], ['secret_key', 'Secret Key'], ['security_token', 'STS Token（可选）']].map(([name, label]) => {
      const control = field(name, label, '', 'password'), input = control.querySelector('input');
      input.required = !data.credentials_configured && name !== 'security_token'; input.maxLength = name === 'security_token' ? 8192 : 256; input.autocomplete = 'new-password';
      input.placeholder = data.credentials_configured ? '留空保留已保存凭证' : '仅加密保存，不会回显'; return control;
    });
    const help = el('p', '桶保持私有，并开启版本控制。AK/SK 需要该桶的上传、分片上传、对象及指定版本读取权限；检查还需要读取桶信息、版本控制、ACL 与桶策略的权限。修改 AK/SK 时会同时替换或清空 STS Token。', 'muted');
    const results = el('div'); results.setAttribute('aria-live', 'polite');
    const probe = button('检查已保存配置', async () => {
      if (fields.concat(secrets).some(c => { const i = c.querySelector('input'); return i.value !== i.defaultValue; })) {
        results.replaceChildren(el('p', '请先保存修改，再重新打开检查。', 'muted')); return;
      }
      results.replaceChildren(el('p', '正在检查，通常需要数秒…', 'muted'));
      try { const result = await call('/api/storage/tos/probe', 'POST', {expected_version: data.version});
        results.replaceChildren(table(['检查项', '结果', '说明'], result.checks.map(c => [c.name, {pass: '通过', fail: '需配置', unknown: '待核对'}[c.state], c.message])), el('p', result.note, 'muted'));
      } catch(e) { results.replaceChildren(el('p', e.message, 'dialog-error')); }
    });
    probe.disabled = !data.version;
    fields.concat(secrets).forEach(c => { const i = c.querySelector('input'); i.defaultValue = i.value; });
    const grid = el('div', undefined, 'tos-fields'); grid.append(...fields, ...secrets);
    dialog('TOS 配置与权限检查', [status, grid, help, probe, results], async form => {
      const payload = Object.fromEntries(form.entries()); payload.expected_version = data.version;
      await call('/api/storage/tos', 'PUT', payload);
    }, '加密保存配置', true);
  }
  async function roleView() {
    if (!workspace && !allowed('role.manage') && allowed('maintenance.platform')) return [button('TOS 配置与权限检查', storageDialog)];
    if (!(workspace ? allowed('space.roles.manage') || allowed('space.members.manage') || me.permissions.includes('space.assign') : allowed('role.manage'))) return denied();
    const data = await api(scoped('/api/roles')), canEdit = allowed(workspace ? 'space.roles.manage' : 'role.manage');
    const toolbar = el('div', undefined, 'toolbar');
    function edit(r) { dialog(r ? '编辑自定义角色' : '创建自定义角色', [field('name', '角色名称', r?.name), el('p', '只能选择你有权授予的权限。', 'muted'), choices('permissions', data.catalog, r?.permissions)], f => call(scoped('/api/roles' + (r ? '/' + r.id : '')), r ? 'PATCH' : 'POST', {name: f.get('name'), permissions: f.getAll('permissions'), ...(r ? {expected_version: r.version} : {})})); }
    if (canEdit) toolbar.append(button('新增角色', () => edit(), 'primary'));
    if (!workspace && me.permissions.includes('maintenance.platform')) toolbar.append(button('TOS 配置与权限检查', storageDialog));
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
  function editVideoPrices(row) {
    const inputs=[], sections=[];
    (row.config.video_models||[]).forEach((model,index)=>{
      const cells=['480p','720p','1080p'].map(resolution=>{
        const values=[false,true].map(hasVideo=>{
          const current=(row.config.model_prices||[]).find(p=>p.kind==='video' && p.model===model
            && p.billing_type==='per_million_tokens' && p.resolution===resolution && p.has_video_input===hasVideo
            && (p.service_tier||'default')==='default' && !Number(p.effective_to));
          const input=el('input');input.type='number';input.min='0';input.step='0.000001';input.name='price_'+inputs.length;
          input.value=current?.unit_price??'';input.placeholder='默认价格';
          input.setAttribute('aria-label',model+' '+resolution+' '+(hasVideo?'有':'无')+'视频输入单价');
          inputs.push({name:input.name,index,resolution,hasVideo,original:String(input.value)});
          return input;
        });
        return [resolution,...values];
      });
      sections.push(el('h3',model),table(['分辨率','无视频输入 · 元/百万 tokens','有视频输入 · 元/百万 tokens'],cells));
    });
    const reason=field('reason','修改价格原因');reason.querySelector('input').maxLength=1000;
    dialog('视频规格价格 · '+row.config.name,[el('p','留空使用系统默认价格，0 表示免费；没有默认价格时仍待核算。保存只调整当前价格，历史任务费用与价格生效记录由服务端保留。'),...sections,reason],form=>{
      const config=JSON.parse(JSON.stringify(row.config));
      // Apply changes to one shared working copy, never mutate the displayed row.
      const next={...config,id:row.id};
      for(const input of inputs){const value=String(form.get(input.name)??'').trim();
        if(value!==input.original)window.ManagementProviderPrices.update(next,input.index,input.resolution,input.hasVideo,value);}
      delete next.id;
      return call('/api/providers/'+encodeURIComponent(row.id),'PUT',{expected_version:row.version,config:next,reason:form.get('reason')});
    },'保存规格价格',true);
  }
  let providerSelection='', providerDraft=null, providerDirty=false;
  function leaveProviderEditor() {
    if(providerDirty && !window.confirm('当前供应商配置尚未保存，确认放弃这些修改？'))return false;
    providerDirty=false;return true;
  }
  function editProvider(row) {
    if(!leaveProviderEditor())return;
    providerDraft=row && !row.version?row:null;providerSelection=row?.id || '__new__';return render();
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
  const diagnosticMessages = {
    task_id_validation: '返回任务 ID 校验错误，可能兼容该任务协议；仍需核对供应商文档。',
    task_error_response: '返回结构化任务错误；不足以判断协议或凭证是否可用。',
    task_endpoint_inconclusive: '无法根据此响应判断任务协议。',
    unexpected_task_response: '虚拟任务查询意外成功；未展示任务内容，无法据此确认协议。',
    models_available: '模型列表格式兼容；不代表生成接口已经验证。',
    models_empty: '返回空模型列表；可以作为入口候选，模型需另行核对。'
  };
  function diagnoseProvider(row) {
    const stamp = serial, member = me.member.id, results = el('div'), reason = field('reason', '诊断与修改原因');
    reason.querySelector('input').maxLength = 1000;
    let detected = null, select;
    const current = () => results.isConnected && $('#dialog').open && serial === stamp && me?.member.id === member;
    const start = button('开始只读诊断', async () => {
      const input = reason.querySelector('input'); if(!input.reportValidity()) return;
      detected = null; $('#confirm-dialog').hidden = true; results.replaceChildren(el('p', '正在检测模型和虚拟任务查询入口…'));
      try {
        const result = await call('/api/providers/' + encodeURIComponent(row.id) + '/probe', 'POST', {mode: 'protocols', expected_version: row.version, reason: input.value});
        if(!current()) return;
        results.replaceChildren(el('p', result.suggestions?.length ? '发现候选入口。请按供应商文档确认后选择，诊断不会自动修改配置。' : '本次未能确定候选协议。可以核对供应商文档后手动编辑配置。'));
        if(result.checks?.length) results.append(table(['入口', 'HTTP', '诊断结果'], result.checks.map(check => [check.protocol + ' · ' + check.path, check.status || '—', diagnosticMessages[check.code] || probeMessages[check.code] || '未完成诊断'])));
        else results.append(el('p', probeMessages[result.code] || '诊断未完成，请重试。', 'error'));
        if(!result.suggestions?.length) return;
        detected = result;
        const label = el('label', '采用配置建议'), blank = el('option', '请选择要采用的协议'); select = el('select'); select.name = 'suggestion'; blank.value = ''; select.append(blank);
        result.suggestions.forEach((item, index) => {const option = el('option', item.protocol + ' · ' + item.base_url); option.value = String(index); select.append(option);});
        label.append(select); results.append(label, el('p', '保存会改变协议和基础地址，影响使用此配置的所有空间；原任务的账号绑定将重新核对。模型、空间分配和启用状态保留。', 'muted'));
        $('#confirm-dialog').hidden = false;
      } catch(error) {if(current()) results.replaceChildren(el('p', error.message, 'error'));}
    });
    dialog('协议与任务端点 · ' + row.config.name, [el('p', '在当前供应商地址下读取三类模型列表，并用随机虚拟任务 ID 检查两类查询入口。诊断请求只使用 GET，不创建生成任务。'), reason, start, results], form => {
      if(!detected || !current()) throw new Error('请先重新诊断供应商。');
      const value = form.get('suggestion');
      if(value === '' || value == null || !detected.suggestions[Number(value)]) throw new Error('请选择要采用的配置建议。');
      const config = Object.fromEntries(Object.entries(row.config).filter(([key]) => !['id','model_prices'].includes(key)));
      const selected = detected.suggestions[Number(value)]; config.protocol = selected.protocol; config.base_url = selected.base_url;
      return call('/api/providers/' + encodeURIComponent(row.id), 'PUT', {expected_version: detected.version, config, reason: form.get('reason')});
    }, '确认采用建议', true);
    $('#confirm-dialog').hidden = true;
  }
  function importProviders() {
    const stamp = serial, member = me.member.id, resultBox = el('div'), reason = field('reason', '导入原因');
    reason.querySelector('input').maxLength = 1000;
    const sourceLabel = el('label', '旧配置来源'), source = el('select'); source.name = 'source';
    for(const [value, text] of [['default_workspace','原共享空间中的配置'], ['local_file','维护人员指定的旧配置文件']]) {
      const option = el('option', text); option.value = value; source.append(option);
    }
    sourceLabel.append(source);
    let preview = null, generation = 0;
    const current = () => resultBox.isConnected && $('#dialog').open && serial === stamp && me?.member.id === member;
    const reset = () => {generation++; preview = null; resultBox.replaceChildren(); $('#confirm-dialog').hidden = true;};
    source.onchange = reset; reason.querySelector('input').oninput = reset;
    const load = button('读取导入预览', async () => {
      const input = reason.querySelector('input'); if(!input.reportValidity()) return;
      reset(); resultBox.append(el('p', '正在读取旧配置…'));
      const selectedSource = source.value, selectedReason = input.value, attempt = generation;
      try {
        const result = await call('/api/provider-imports/preview', 'POST', {source: selectedSource, reason: selectedReason});
        if(!current() || attempt !== generation || source.value !== selectedSource || input.value !== selectedReason) return;
        preview = result;
        const statuses = {available:'可导入', existing:'已存在，跳过', retired:'已弃用，跳过', duplicate:'ID 重复，跳过', invalid:'格式不兼容，跳过', credential_conflict:'凭证冲突或格式错误，跳过'};
        const rows = result.items.map(item => {
          const choose = el('input'); choose.type = 'checkbox'; choose.name = 'provider_ids'; choose.value = item.id || '';
          choose.disabled = item.status !== 'available'; choose.setAttribute('aria-label', '导入 ' + (item.id || '第 ' + (item.index + 1) + ' 项'));
          const credentials = el('input'); credentials.type = 'checkbox'; credentials.name = 'credential_provider_ids'; credentials.value = item.id || '';
          credentials.disabled = true; credentials.setAttribute('aria-label', '同时迁移凭证 ' + (item.id || '第 ' + (item.index + 1) + ' 项'));
          choose.onchange = () => {credentials.disabled = !choose.checked || !item.configured_secrets.length; if(credentials.disabled) credentials.checked = false;};
          const details = el('details'); details.append(el('summary', '查看配置摘要'));
          if(item.config) details.append(el('pre', JSON.stringify(item.config, null, 2), 'details'));
          if(item.was_primary) details.append(el('p', '原默认供应商；导入后仍需单独分配空间及默认项。'));
          if(item.normalized) details.append(el('p', '摘要已按当前格式整理，请核对模型、价格及高级配置。'));
          return [choose, labelText(item.config?.name || item.id || '无法识别', item.id), statuses[item.status] || '不可导入',
            item.configured_secrets.join('、') || '无', credentials, item.config ? details : '请核对原文件'];
        });
        resultBox.replaceChildren(el('p', '预览有效至 ' + new Date(result.expires_at).toLocaleTimeString() + '。勾选要创建的配置；需要复制密钥时另行勾选“迁移凭证”。'));
        resultBox.append(rows.length ? table(['选择','供应商','结果','可用凭证','迁移凭证','摘要'], rows) : el('p', '此来源没有旧供应商配置。'));
        $('#confirm-dialog').hidden = !result.items.some(item => item.status === 'available');
      } catch(error) {if(current() && attempt === generation) resultBox.replaceChildren(el('p', error.message, 'error'));}
    });
    dialog('导入旧供应商配置', [el('p', '仅创建勾选的供应商，不覆盖现有配置。凭证只在服务端复制并加密；原文件保留。导入后请单独选择空间进行分配。'), sourceLabel, reason, load, resultBox], async form => {
      if(!preview || !current()) throw new Error('请重新读取导入预览。');
      const provider_ids = form.getAll('provider_ids'), credential_provider_ids = form.getAll('credential_provider_ids');
      if(!provider_ids.length) throw new Error('请勾选需要导入的供应商。');
      const result = await call('/api/provider-imports/' + encodeURIComponent(preview.id) + '/confirm', 'POST', {provider_ids, credential_provider_ids});
      if(!current()) return;
      setTimeout(() => {
        if(me?.member.id === member && !$('#dialog').open && view === 'providers') dialog('供应商导入完成', [
          el('p', '已创建 ' + result.imported.length + ' 个供应商。空间分配未改变，请在供应商列表中选择目标空间后分配。'),
          table(['供应商','已迁移凭证'], result.imported.map(item => [item.id, item.configured_secrets.join('、') || '无'])),
          el('p', '导入记录：' + result.id, 'muted')
        ], null, '关闭', true);
      }, 0);
    }, '确认导入所选配置', true);
    $('#confirm-dialog').hidden = true;
  }
  async function providerView() {
    if(!me.permissions.includes('provider.configure')) return denied();
    const scope=workspace, stamp=serial, memberId=me.member.id;
    const [data,assigned]=await Promise.all([api('/api/providers'),scope?api('/api/provider-assignments?workspace='+encodeURIComponent(scope)):Promise.resolve(null)]);
    const presets=data.presets||{builtin:[],quickstart:[]},rows=window.ManagementProviderEditor.rows(data.providers,presets);
    const toolbar=el('div',undefined,'toolbar');toolbar.append(button('新增自定义平台',()=>editProvider(), 'primary'),button('旧版快捷配置',()=>{
      const grid=el('div',undefined,'provider-presets');
      presets.quickstart.forEach(p=>{const card=el('section',undefined,'card');card.append(el('h3',p.config.name),el('p',p.description,'muted'),el('code',p.config.base_url),button('使用 '+p.config.name,()=>{
        $('#dialog').close();const existing=rows.find(r=>r.id===p.id);return editProvider(existing||{...p,version:0,configured_secrets:[]});
      }));grid.append(card);});
      dialog('旧版快捷配置',[el('p','沿用旧项目中的地址、协议和模型预设。选择后填写 Key 并保存；实际可用模型以你的上游账号为准。'),grid],null,'关闭',true);
    }),button('导入旧配置',()=>{if(leaveProviderEditor())return importProviders();}),button('刷新配置',()=>{if(leaveProviderEditor())return refresh();}));
    if(scope && me.permissions.includes('space.assign'))toolbar.append(button('分配到本空间',()=>{
      if(!leaveProviderEditor())return;
      const primaryLabel=el('label','默认供应商'),primary=el('select');primary.name='primary';const none=el('option','不指定默认');none.value='';primary.append(none);
      data.providers.forEach(row=>{const option=el('option',row.config.name);option.value=row.id;primary.append(option);});primary.value=assigned.primary_provider_id||'';primaryLabel.append(primary);
      const reason=field('reason','分配原因');reason.querySelector('input').maxLength=1000;
      dialog('分配供应商 · '+me.workspaces.find(item=>item.id===scope)?.name,[el('p','仅已保存的供应商可以分配。内置预设需先配置；取消分配后不能发起新调用。'),choices('provider_ids',data.providers.map(row=>({id:row.id,name:row.config.name+(row.config.enabled?'':'（已停用）')})),assigned.provider_ids),primaryLabel,reason],form=>call('/api/provider-assignments?workspace='+encodeURIComponent(scope),'PUT',{provider_ids:form.getAll('provider_ids'),primary_provider_id:form.get('primary')||null,expected_version:assigned.version,reason:form.get('reason')}));
    }));
    let selected=providerDraft || rows.find(r=>r.id===providerSelection);
    if(providerSelection==='__new__')selected={config:{},version:0,configured_secrets:[]};
    if(!selected)selected=rows[0]||{config:{},version:0,configured_secrets:[]};providerSelection=selected.id||'__new__';
    const layout=el('div',undefined,'provider-layout'),sidebar=el('section',undefined,'provider-sidebar');sidebar.append(el('h2','平台列表'));
    rows.forEach(row=>{const b=button('',()=>editProvider(row),'provider-choice'+(row.id===selected.id?' selected':''));
      b.append(el('strong',row.config.name),el('small',row.builtin?'内置平台':'自定义平台'),el('span',!row.version?'待配置':row.config.enabled?'已启用':'已停用','badge'));
      if(scope)b.append(el('small',assigned.provider_ids.includes(row.id)?assigned.primary_provider_id===row.id?'本空间默认':'已分配本空间':'未分配本空间'));
      sidebar.append(b);});layout.append(sidebar);
    const editor=window.ManagementProviderEditor.create({row:selected,current:()=>serial===stamp&&me?.member.id===memberId&&workspace===scope,
      onDirty:value=>{providerDirty=value;},save:async value=>{
        if(serial!==stamp||me?.member.id!==memberId)throw new Error('页面身份已变化，请重新打开配置。');
        await call('/api/providers/'+encodeURIComponent(value.id),'PUT',value.body);
        if(serial!==stamp||me?.member.id!==memberId||workspace!==scope)return;
        providerDirty=false;providerDraft=null;providerSelection=value.id;await refresh();notice('供应商配置已保存');
      },probe:()=>probeProvider(selected),diagnose:()=>diagnoseProvider(selected),prices:()=>editVideoPrices(selected)});
    layout.append(editor);
    return [el('p','平台配置统一维护，按空间分配使用。火山引擎默认保留；地址、凭证、模型与高级选项分组管理。','muted'),toolbar,layout];
  }
  const backupStates = {queued:'等待备份执行器',running:'正在备份',succeeded:'已完成并校验',failed:'备份失败',cancelled:'权限变化，已取消'};
  const backupFailures = {backup_export_failed:'导出或校验失败，请运维检查备份目录、对象存储和磁盘空间。',backup_interrupted:'执行器中断，未完成的文件已保留。请检查后重新发起。',backup_authorization_changed:'发起者会话或权限已变化，请重新登录并核实授权。'};
  function requestBackup(scope) {
    const member = me.member.id, requestId = crypto.randomUUID();
    let sent;
    const reason = field('reason','备份说明'); reason.querySelector('input').maxLength=1000;
    const label = el('label',undefined,'check'), confirm=el('input');confirm.type='checkbox';confirm.name='confirmed';confirm.required=true;
    label.append(confirm,document.createTextNode(scope ? '确认导出所选空间的共享数据' : '确认创建包含全部空间和成员数据的平台备份'));
    dialog(scope ? '请求空间数据导出' : '请求全库备份',[
      el('p',scope ? '包含共享画布、素材、目录、提示词和费用；私人对话、登录会话、供应商配置和任务执行状态不在此导出中。灾难恢复需要全库备份。' : '创建数据库一致性快照并复制固定版本对象。未完成的上传不算已备份；本操作不会停止服务或执行恢复。'),
      el('p','完成的归档由运维从受控备份目录取用，页面仅展示执行记录。','muted'),reason,label
    ],async data=>{
      if(!me || me.member.id!==member || workspace!==scope)throw new Error('管理范围已变化，请重新打开。');
      const note=String(data.get('reason')||'').trim();
      if(!note || !data.has('confirmed'))throw new Error('请填写说明并确认备份范围。');
      const payload={request_id:requestId,reason:note};
      if(sent && JSON.stringify(sent)!==JSON.stringify(payload))throw new Error('重试不能更改已发送内容，请关闭后重新发起。');
      sent=payload;
      await call('/api/backups'+(scope?'?workspace='+encodeURIComponent(scope):''),'POST',sent);
    },'确认请求');
  }
  async function backupView() {
    const canRead=allowed(workspace?'backup.read':'backup.platform'),canRequest=allowed(workspace?'backup.request':'backup.platform');
    if(!canRead && !canRequest)return denied();
    const scope=workspace;
    const data=canRead?await api(scoped('/api/backups',{...(backupAfter?{after:backupAfter}:{})})):{jobs:[],configured:true};
    const toolbar=el('div',undefined,'toolbar');
    if(canRequest){const create=button(scope?'请求空间导出':'请求全库备份',()=>requestBackup(scope));create.disabled=!data.configured;toolbar.append(create);}
    toolbar.append(button('刷新记录',refresh));
    const note=el('p',data.configured?'备份任务由独立执行器处理。归档完成且校验通过后显示成功；此处不执行数据库恢复。':'运维尚未配置备份存储目录，暂不能发起备份。','muted');
    const records=table(['请求时间','类型','状态','结果','说明'],data.jobs.map(row=>[
      labelText(new Date(row.created_at).toLocaleString(),row.id),row.kind==='workspace_export'?'空间共享数据导出':'平台全库备份',
      backupStates[row.status]||row.status,
      row.status==='succeeded'?String(row.summary.objects||0)+' 个对象 · '+String(row.summary.object_bytes||0)+' 字节 · '+String(row.summary.unfinished_assets||0)+' 项未完成素材':(backupFailures[row.error_code]||'—'),
      row.reason
    ]));
    const pages=actions(button('返回首批',()=>{backupAfter='';return render();}));
    if(data.next)pages.append(button('下一批',()=>{backupAfter=data.next;return render();}));
    return [toolbar,note,...(canRead?[records,pages]:[el('p','已获备份请求权限；查看执行记录还需要备份记录权限。','muted')])];
  }

  const occupancyStates = {active:'正在编辑', released:'已结束', expired:'已到期', invalid:'资格已失效'};
  function revokeOccupancy(row, scope) {
    const stamp=serial, memberId=me?.member.id;
    if(scope!==workspace || !memberId || row.state!=='active')return;
    const reason=field('reason','结束占用的原因');reason.querySelector('input').maxLength=1000;
    const confirmation=choices('confirm',[{id:'yes',name:'已联系编辑者或核对情况，确认结束此次占用'}]);
    dialog('结束画布占用',[
      el('p', '空间：'+(me.workspaces.find(w=>w.id===scope)?.name || scope)),
      labelText(row.title || '未命名画布',row.canvas_id),
      el('p', '当前编辑者：'+row.holder.display_name+' · '+row.holder.id),
      el('p', '确认的编辑代次 '+row.generation+'，画布版本 '+row.revision+'。'),
      el('p','结束后原页面不能继续保存；后台不会保存未提交的修改。请成员保留或导出草稿。其他成员需在工作台重新开始编辑。'),
      reason,confirmation
    ],f=>{
      if(serial!==stamp || workspace!==scope || me?.member.id!==memberId)throw new Error('管理范围或账号已变化，请重新打开。');
      const note=String(f.get('reason') || '').trim();
      if(!note || !f.has('confirm'))throw new Error('请填写原因并勾选确认。');
      return call('/api/canvas-occupancy/'+encodeURIComponent(row.canvas_id)+'/revoke?'+new URLSearchParams({workspace:scope}),
        'POST',{expected_generation:row.generation,expected_revision:row.revision,confirm:true,reason:note});
    },'确认结束占用');
  }
  async function occupancyView() {
    if(!workspace)return [el('div','请选择一个空间查看画布占用。','empty')];
    if(!allowed('canvas.read') || !allowed('canvas.lock.takeover'))return denied();
    const scope=workspace, data=await api('/api/canvas-occupancy?'+new URLSearchParams({workspace:scope,after:occupancyAfter}));
    const toolbar=el('div',undefined,'toolbar');toolbar.append(button('刷新占用',refresh));
    const rows=data.canvases.map(row=>[
      labelText(row.title || '未命名画布',row.canvas_id), (row.kind==='smart'?'智能画布':'经典画布')+(row.trashed?' · 回收站':''),
      occupancyStates[row.state] || '未知',row.holder?labelText(row.holder.display_name,row.holder.id):'—',
      row.generation+' / '+row.revision,new Date(row.expires_at).toLocaleString(),
      row.state==='active'?button('结束占用',()=>revokeOccupancy(row,scope),'danger'):'—'
    ]);
    const pages=el('div',undefined,'toolbar');
    if(occupancyAfter)pages.append(button('回到首页',()=>{occupancyAfter='';return render();}));
    if(data.next)pages.append(button('下一页',()=>{occupancyAfter=data.next;return render();}));
    return [el('p','显示此空间有过编辑记录的画布及其最近一次占用。此列表是查询时的状态；确认时若画布已保存或编辑资格改变，操作将被拒绝。','muted'),
      toolbar,rows.length?table(['画布','类型','占用状态','当前编辑者','代次 / 版本','到期时间','操作'],rows):el('div','此页没有画布占用记录。','empty'),pages,
      el('p','占用结束不表示页面草稿已保存，也不会停止已提交的生成任务。维护前仍需核对页面报告和任务状态。','muted')];
  }
  const taskStates = {needs_review:'待核对',queued:'排队中',running:'准备执行',submitting:'提交中',polling:'查询中',finalizing:'结果入库中',succeeded:'已完成',failed:'已失败',cancelled:'已取消'};
  const taskActions = {retry_finalization:'重试结果入库',resume_polling:'恢复原任务查询',cancel_unsubmitted:'取消未提交任务',confirm_failed:'核对后标记失败'};
  const taskExplanations = {
    retry_finalization:'继续处理已保存的结果来源，由 worker 完成入库。',
    resume_polling:'使用已保存的逐图回执或上游任务 ID，以原供应商账号继续查询；已保存的图片结果直接复用。',
    cancel_unsubmitted:'结束本地尚未付费提交的任务，后续不再执行。',
    confirm_failed:'请先向供应商核实失败或未产生可交付结果。此操作结束本地任务跟踪，费用记录保持。'
  };
  async function reviewTask(taskId, scope) {
    const stamp = serial, member = me.member.id;
    const row = await api('/api/tasks/' + encodeURIComponent(taskId) + '?workspace=' + encodeURIComponent(scope));
    if(serial !== stamp || me?.member.id !== member || workspace !== scope) return;
    const summary = table(['项目','当前记录'], [
      ['任务',row.id],['状态',taskStates[row.status] || row.status],['供应商',row.provider_id || '未知'],
      ['上游任务 ID',row.upstream_task_id || '未记录'],['已保存结果来源',row.result_checkpoint ? '有' : '无'],
      ['付费提交记录',Object.entries(row.submission_counts).map(([key,n]) => (({admitted:'已记录提交',responded:'已收到响应',uncertain:'响应不明确'})[key] || '其他') + ' × ' + n).join('、') || '无'],
      ['账号核对',({matched:'与原任务一致',changed:'已变化',missing:'配置不存在',unavailable:'暂时无法核验',unverified:'旧账号尚未映射',retired:'集成已弃用'})[row.account_status] || '未知'],
      ['执行占用',row.leased ? '正在执行，暂不可处置' : '无有效执行占用']
    ]);
    if(row.image_receipts) {
      const r=row.image_receipts;
      summary.append(el('p',`图片共 ${r.requested} 张：已保存结果 ${r.saved_results}，可查询原任务 ${r.queryable}，回执缺失 ${r.unknown}。`,'muted'));
    }
    const history = row.reviews.length ? table(['最近核对时间','操作','说明'], row.reviews.map(item => [new Date(item.created_at).toLocaleString(),taskActions[item.action] || item.action,item.note])) : el('p','暂无人工处置记录。','muted');
    if(!row.actions.length) {
      dialog('任务记录 · ' + row.id,[summary,el('p','当前状态没有可执行的处置操作。请核对执行状态、结果来源及原供应商账号。'),history],null,'关闭',true); return;
    }
    const label=el('label','处置方式'), select=el('select'), blank=el('option','请选择处置方式');
    select.name='action';select.required=true;blank.value='';select.append(blank);
    row.actions.forEach(key=>{const option=el('option',taskActions[key]);option.value=key;select.append(option);});label.append(select);
    const explanation=el('p','','muted'), verifiedLabel=el('label',undefined,'check'), verified=el('input');
    verified.type='checkbox';verified.name='upstream_verified';verifiedLabel.append(verified,document.createTextNode('我已向供应商核实失败或没有可交付结果'));verifiedLabel.hidden=true;
    select.onchange=()=>{explanation.textContent=taskExplanations[select.value] || '';verifiedLabel.hidden=select.value!=='confirm_failed';verified.required=!verifiedLabel.hidden;verified.checked=false;};
    const note=field('note','核对依据与处置原因');note.querySelector('input').maxLength=1000;
    const requestId=crypto.randomUUID();let submitted=null;
    dialog('处置任务 · ' + row.id,[summary,label,explanation,verifiedLabel,note,history], async form=>{
      const action=form.get('action');
      if(!row.actions.includes(action)) throw new Error('请选择处置方式。');
      const payload={request_id:requestId,expected_version:row.review_version,action,note:form.get('note'),upstream_verified:form.has('upstream_verified')};
      if(action==='confirm_failed' && !payload.upstream_verified) throw new Error('请先确认已向供应商核对。');
      if(submitted && JSON.stringify(submitted)!==JSON.stringify(payload)) throw new Error('已发送的处置请求不能更改内容。请关闭后重新核对当前任务。');
      submitted=payload;
      await call('/api/tasks/' + encodeURIComponent(row.id) + '/review?workspace=' + encodeURIComponent(scope),'POST',payload);
    },'确认处置',true);
  }
  async function taskView() {
    if(!workspace) return [el('p','请选择要核对任务的空间。')];
    if(!allowed('task.review')) return denied();
    const scope=workspace, data=await api('/api/tasks?' + new URLSearchParams({workspace:scope,status:taskStatus,after:taskAfter}));
    const toolbar=el('div',undefined,'toolbar'), label=el('label','任务状态'), select=el('select');
    for(const [key,text] of [['all','全部状态'],...Object.entries(taskStates)]) {const option=el('option',text);option.value=key;select.append(option);}
    select.value=taskStatus;select.onchange=()=>{taskStatus=select.value;taskAfter='';execute(render);};label.append(select);
    toolbar.append(label,button('刷新任务',refresh));
    const counts=el('p',Object.entries(data.counts).map(([key,n])=>(taskStates[key] || key)+' '+n).join(' · ') || '当前空间没有任务。','muted');
    const rows=data.tasks.map(row=>[labelText(row.id,row.model),taskStates[row.status] || row.status,row.provider_id || '未知',
      row.upstream_task_id || '未记录',row.leased?'执行中':'无占用',new Date(row.updated_at).toLocaleString(),
      button('核对 · ' + row.id,()=>reviewTask(row.id,scope))]);
    const pages=el('div',undefined,'toolbar');
    if(taskAfter) pages.append(button('回到首批',()=>{taskAfter='';return render();}));
    if(data.next) pages.append(button('下一批任务',()=>{taskAfter=data.next;return render();}));
    return [el('p','处置仅作用于当前空间。恢复查询和结果入库不会创建新的生成请求。'),toolbar,counts,
      rows.length?table(['任务 / 模型','状态','供应商','上游任务','执行占用','更新时间','操作'],rows):el('p','当前筛选下没有任务。'),pages];
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
  function releaseChecksPanel(report) {
    const panel=el('section',undefined,'card');panel.append(el('h2','维护发布检查'));
    if(!report){panel.append(el('p','检查报告暂不可用，请更新服务并重新读取状态。'));return panel;}
    const labels={
      new_business_admission:['新业务准入','先进入排空或更严格的维护状态。'],
      active_tasks:['执行中任务','等待已提交任务查询、结果入库与费用记录完成。'],
      task_execution_leases:['任务执行占用','等待执行器释放占用，不仅检查任务状态。'],
      expired_task_leases:['过期任务占用','核对原执行器后由受控恢复流程处理；过期不代表进程已停止。'],
      unfinished_submissions:['尚未返回的提交记录','核实供应商是否已受理，不要直接重新生成。'],
      tasks_needing_review:['待核对任务','在任务处置中核实结果与恢复依据。'],
      pending_uploads:['未完成上传','等待已有上传完成或核对取消。'],
      upload_processing:['上传处理中','等待分片确认、验证与入库结束。'],
      expired_unfinished_uploads:['过期未收尾上传','核对上传状态并按受控流程清理临时分片。'],
      canvas_edit_leases:['有效画布占用','请成员保存并结束编辑。'],
      unsaved_reported_pages:['在线页未保存','请成员保存或导出草稿。'],
      unreviewed_pages:['待核对页面','查看页面报告并核实失联或关闭前的编辑。'],
      pending_backups:['排队或执行中的备份','等待备份/导出结束并检查结果。'],
      queued_task_recovery:['暂停的排队任务','发布前核对持久队列与新版本的恢复兼容性。']
    };
    const states={passed:'本次检查通过',blocked:'尚未完成',review_required:'待运维核对'};
    panel.append(el('p',report.observed_checks_passed?'已记录的数据检查通过，仍需完成以下运维核对。':'仍有未完成或待核对项目。'),
      el('p','检查时间：'+new Date(report.observed_at).toLocaleString()+'。这是本次读取的状态，不会锁定服务或授权停库。','muted'),
      table(['检查项','数量 / 判断','状态','处理说明'],report.checks.map(item=>{
        const label=labels[item.code]||['未识别检查项','请更新管理页面后重新读取。'];
        return [label[0],item.code==='new_business_admission'?(item.count?'仍开放':'已限制'):item.count,states[item.status]||'待核对',label[1]];
      })));
    const manual={unreported_pages:'联系成员核对未上报页面、旧客户端和本地草稿。',
      backup_integrity_and_restore:'校验本次发布所用备份及对象完整性，并确认恢复方案可执行。',
      release_compatibility:'核对代码版本、数据库迁移和已有任务的恢复兼容性。',
      stop_all_database_clients:'由运维核实工作台、任务与备份执行器、管理服务及其他数据库客户端均已停止。',
      verify_no_inflight_transactions:'在停库前核验真实数据库连接与在途事务。'};
    panel.append(el('h3','运维仍需确认'));
    for(const code of report.operator_checks)panel.append(el('p',manual[code]||'存在未识别的运维检查项，请更新页面。'));
    panel.append(el('p',report.database_stop.status==='not_applicable'
      ?'当前仅检查本空间，不能据此停止全平台数据库。'
      :'尚未取得停库确认。心跳消失不能证明进程退出；管理平台自身仍会访问数据库。','muted'));
    return panel;
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
      dialog('更改维护 · ' + scopeName, [el('p', `当前有 ${activity.canvas_locks ?? '未知数量的'} 个画布占用、${activity.active_tasks} 个执行中任务、${activity.queued_tasks} 个排队任务；${activity.uploads.pending} 个未完成上传、${activity.uploads.processing} 个处理中上传，${activity.unsaved_pages ?? '未知数量的'} 个在线未保存页面。更改访问限制不会取消已提交任务或替成员保存未上传内容。`), modeLabel, message, reason, planned, grace, confirm], f => call(scoped('/api/maintenance'), 'PATCH', {
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
    for (const [kind, name] of [['workbench', '工作台服务'], ['worker', '任务消费者']]) { const row = activity.services.find(s => s.kind === kind); services.append(el('p', name + '：' + (row?.online ? row.online+' 个在线心跳' : '当前无有效在线心跳') + '；' + (row?.unknown || 0) + ' 个失联且未确认退出')); }
    services.append(el('p', '画布占用不代表草稿已保存。页面报告只覆盖已上报的页面，失联页面与旧客户端仍需核对；即使计数为零，也不能据此确认可以停止数据库或发布服务。已有付费任务仍可能写入结果与费用。', 'muted'));
    const pages=el('section',undefined,'card'), reports=activity.page_reports;
    pages.append(el('h2','页面保存报告'));
    if(reports) pages.append(el('p',`在线上报 ${reports.online_pages} 页；失联 ${reports.stale_pages} 页，其中最后报告未保存 ${reports.stale_unsaved_pages} 页；关闭时未保存 ${reports.closed_unsaved_pages} 页。`),
      el('p',`超过 ${reports.stale_after_seconds} 秒未收到报告或成员授权已失效的页面列为失联。报告不包含草稿正文，后台不能代替成员保存。`,'muted'));
    else pages.append(el('p','页面报告暂不可用，不能据此确认已保存。'));
    if(reports) pages.append(el('p', '待人工核对 ' + reports.pending_review_pages + ' 页；当前报告已核对 ' + reports.reviewed_pages + ' 页。核对后保留原报告状态。'),
      actions(button('查看待核对页面', () => showPageReports()), button('查看已核对页面', () => showPageReports(true))));
    return [summary, toolbar, metrics, pages, releaseChecksPanel(activity.release_checks), services];
  }
  $('#cancel-dialog').onclick = () => $('#dialog').close();
  $('#scope').onchange = () => execute(() => { if(view==='providers'&&!leaveProviderEditor()){$('#scope').value=workspace;return;} workspace = $('#scope').value; occupancyAfter = ''; backupAfter = ''; taskAfter = ''; pageAfter = auditBefore = ''; return render(); });
  document.querySelectorAll('[data-view]').forEach(b => b.onclick = () => execute(() => { if(view==='providers'&&!leaveProviderEditor())return; view = b.dataset.view; occupancyAfter = ''; pageAfter = auditBefore = ''; return render(); }, b));
  $('#logout').onclick = () => execute(async () => { await call('/api/auth/logout', 'POST'); showLogin(); });
  $('#unavailable-logout').onclick = $('#logout').onclick;
  $('#retry').onclick = () => execute(refresh);
  $('#login-form').onsubmit = e => { e.preventDefault(); execute(async () => {
    const f = new FormData(e.target); await call('/api/auth/login', 'POST', {username: f.get('username'), password: f.get('password'), remember: f.has('remember')});
    e.target.reset(); $('#message').hidden = true; await refresh();
  }, e.target.querySelector('button')); };
  refresh().catch(e => { if (e.status !== 401) notice(e.message, true); });
})();
