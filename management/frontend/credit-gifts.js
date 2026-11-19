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
  const categoryName = category => category === 'recharge' ? '充值积分' : '赠送积分';
  const deductionCategory = category => category ? categoryName(category) : '按扣减顺序';
  const expiryName = data => data.expires_at ? new Date(data.expires_at).toLocaleString('zh-CN')
    : data.valid_days ? `入账后 ${data.valid_days} 天` : '永久有效';
  function select(title, options) {
    const label = el('label', title), node = el('select');
    node.setAttribute('aria-label', title);
    for (const [value, text] of options) node.append(new Option(text, value));
    label.append(node);
    return {label, node};
  }
  function facts(data, deducting) {
    const box = el('div', undefined, 'credit-gift-facts');
    const lines = [
      [deducting ? '目标账号' : '收款账号', `${data.target.display_name} / ${data.target.username} / ${data.target.id}`]
    ];
    if (deducting) {
      lines.push(['扣减积分', data.amount], ['扣减类别', deductionCategory(data.category)], ['扣减原因', data.reason]);
      for (const key of ['gift', 'recharge']) {
        const amount = data.allocations.filter(row=>row.category===key).reduce((sum,row)=>sum+BigInt(row.amount),0n);
        if (amount) lines.push([categoryName(key), '−'+amount]);
      }
      if (data.applied) lines.push(['操作后总余额', data.balance_after],
        ['流水编号', data.allocations.map(row=>row.transaction_id).join('、')]);
      else lines.push(['所选范围可用积分', `${data.available_before} → ${data.available_after}`]);
    } else {
      if (!data.applied && data.wallet) {
        const change = value => `${value} → ${BigInt(value) + BigInt(data.amount)}`;
        lines.push(['预计总余额', change(data.wallet.total_balance)],
          ['预计'+categoryName(data.category)+'余额', change(data.wallet[data.category+'_balance'])]);
      }
      lines.push(['发放积分', data.amount], ['分类与有效期', `平台赠送 · ${categoryName(data.category)} · ${expiryName(data)}`],
        ['赠送原因', data.reason], ['来源依据', data.evidence_ref]);
    }
    lines.push(['请求编号', data.request_id]);
    if (data.actor) lines.push([deducting ? '操作人' : '操作人（入账时）', `${data.actor.display_name} / ${data.actor.username} / ${data.actor.id}`]);
    if (data.grant_id) lines.push(['入账编号', data.grant_id], ['流水编号', data.transaction_id], ['入账后总余额', data.balance_after]);
    for (const [name, value] of lines) box.append(el('p', `${name}：${value}`));
    return box;
  }
  function mountOperation(root, {api, canGift, memberId}, deducting) {
    const verb = deducting ? '扣减' : '赠送';
    const base = '/api/credits/' + (deducting ? 'deductions' : 'gifts');
    const storageKey = 'management-credit-' + (deducting ? 'deduct' : 'gift') + '-pending:' + memberId;
    const post = (route, data) => api(base + '/' + route, {method:'POST', body:JSON.stringify(data)});
    let reloadHistory;
    if (canGift) {
      const card = el('section', undefined, 'card'), form = el('form'), fields = el('fieldset');
      card.dataset.creditPanel=deducting?'deduct':'grant';card.setAttribute('role','tabpanel');
      const steps=el('ol',undefined,'credit-steps');
      const stepNames = deducting ? ['填写扣减信息','核对账号与扣减金额','确认扣减'] : ['填写发放信息','核对账号与来源','确认入账'];
      stepNames.forEach(name=>steps.append(el('li',name)));card.append(steps);
      const setStep=index=>Array.from(steps.children).forEach((step,i)=>{step.classList.toggle('current',i===index);if(i===index)step.setAttribute('aria-current','step');else step.removeAttribute('aria-current');});setStep(0);
      fields.append(el('legend', deducting ? '积分扣减 / 冲正' : '新增管理员赠送'));
      const controls = [input(deducting?'目标登录账号':'收款登录账号', 'username', 64),
        input(verb+'积分数（正整数）', 'amount', 19), input(verb+'原因（管理端留档）', 'reason', 1000, true)];
      if (!deducting) controls.push(input('来源依据（工单、审批或活动编号）', 'evidence_ref', 500, true));
      controls[1].node.inputMode = 'numeric'; controls[1].node.pattern = '[1-9][0-9]{0,18}';
      const login = controls[0].node, accountField = el('div', undefined, 'credit-account-field');
      const balance = el('p', '', 'credit-account-summary'); balance.setAttribute('role','status');
      let lookupVersion = 0;
      function clearBalance() { lookupVersion++; balance.textContent = ''; }
      async function lookup() {
        const version = ++lookupVersion, username = login.value.trim();
        if (!username) { balance.textContent = ''; return; }
        balance.textContent = '正在查询余额…';
        try {
          const {target,wallet} = await api('/api/credits/wallets?' + new URLSearchParams({username}));
          if (version !== lookupVersion) return;
          balance.textContent = `${target.display_name}（${target.username}）　充值余额 ${wallet.recharge_balance}　赠送余额 ${wallet.gift_balance}　冻结中 ${wallet.frozenBalance}　可用余额 ${wallet.availableBalance}`;
        } catch (error) { if (version === lookupVersion) balance.textContent = error.message; }
      }
      const query = button('查余额', lookup);
      login.oninput = clearBalance;
      login.onblur = event => { if (event.relatedTarget !== query) void lookup(); };
      accountField.append(controls[0].label, query);
      fields.append(accountField, controls[1].label, balance, ...controls.slice(2).map(c=>c.label));
      const category = select(deducting?'扣减类别':'积分类别',
        [...(deducting?[['','按顺序（先赠送，后充值）']]:[]), ['gift', '赠送积分'], ['recharge', '充值积分']]);
      const validity = deducting ? null : select('有效期', [['permanent', '永不过期'], ['days', '指定天数']]);
      const days = el('input'), daysLabel = el('label', '有效天数');
      const updateValidity = () => {
        daysLabel.hidden = days.disabled = validity.node.value !== 'days';
      };
      fields.append(category.label);
      if (validity) {
        days.type = 'number'; days.min = '1'; days.step = '1'; days.required = true;
        daysLabel.append(days); validity.node.onchange = updateValidity;
        fields.append(validity.label, daysLabel); updateValidity();
        const presets = el('div', undefined, 'credit-presets');
        for (const [title,internal] of [['内部员工额度',true],['外部客户补偿',false]]) {
          presets.append(button(title, () => {
            category.node.value = internal ? 'recharge' : 'gift';
            validity.node.value = internal ? 'permanent' : 'days';
            days.value = internal ? '' : '30'; updateValidity();
            for (const field of controls.slice(2)) {
              if (internal) field.node.value = title;
              else if (field.node.value === '内部员工额度') field.node.value = '';
            }
          }));
        }
        fields.insertBefore(presets, accountField);
      }
      const message = el('p'); message.setAttribute('role', 'status');
      const previewBox = el('div'), actions = el('div', undefined, 'actions');
      const preview = el('button', '预览'+verb); preview.type = 'submit';
      let requestId = crypto.randomUUID(), ready = null, pending = null, uncertain = false, busy = false;
      const savePending = value => sessionStorage.setItem(storageKey, JSON.stringify(value));
      const clearPending = id => {
        // A detached page's late response must not erase a newer operation.
        const saved = sessionStorage.getItem(storageKey);
        if (saved && JSON.parse(saved).request_id === id) sessionStorage.removeItem(storageKey);
      };
      const edit = () => {
        setStep(0);ready = null; fields.disabled = false; preview.hidden = false;
        confirm.hidden = true; revise.hidden = true; previewBox.replaceChildren();
      };
      const finish = receipt => {
        clearBalance();
        // A confirmed receipt can be shown even if storage cleanup is unavailable.
        try { clearPending(receipt.request_id); } catch (_) { /* A retained request is safe to replay. */ }
        setStep(2);pending = null; ready = null; fields.disabled = true; preview.hidden = confirm.hidden = revise.hidden = true;
        form.dataset.dirty = 'false';
        previewBox.replaceChildren(facts(receipt,deducting)); next.hidden = false;
        message.textContent = deducting ? '已扣减。凭证可在扣减记录中查询。' : '已入账。以下编号可用于核对来源记录与操作审计。';
      };
      const confirm = button('确认'+verb, async () => {
        if (busy || (!ready && !pending)) return;
        const hadUncertainty = uncertain;
        const payload = pending || ready;
        try { savePending(payload); }
        catch (_) { message.textContent = '无法保存本次请求编号，请恢复浏览器会话存储后重试。尚未发起'+verb+'。'; return; }
        busy = true; pending = payload; uncertain = true;
        fields.disabled = true; confirm.disabled = true; preview.hidden = revise.hidden = true;
        try {
          const receipt = await post('apply', payload);
          finish(receipt);
          if (!deducting) await reloadHistory();
        } catch (error) {
          if (!hadUncertainty && [400,401,403,409,422].includes(error.status)) {
            try { clearPending(payload.request_id); } catch (_) { /* Retrying a rejected request remains safe. */ }
            pending = null; uncertain = false; edit();
            message.textContent = error.message + ' 请重新核对并预览。';
          } else {
            message.textContent = error.message + ' ' + verb + '结果待确认，请用本次请求重试。请求编号：' + payload.request_id;
            confirm.textContent = '重试确认结果';
          }
        } finally { busy = false; confirm.disabled = false; }
      });
      const revise = button('修改内容', () => { edit(); message.textContent = ''; });
      const next = button('新建'+verb, () => {
        clearBalance();
        requestId = crypto.randomUUID(); uncertain = false; form.reset(); if(validity)updateValidity(); edit(); next.hidden = true; message.textContent = '';
      });
      preview.classList.add('primary');confirm.classList.add('primary');confirm.hidden = revise.hidden = next.hidden = true;
      actions.append(preview, confirm, revise, next); form.append(fields, previewBox, message, actions); card.append(form); root.append(card);
      form.onsubmit = async event => {
        event.preventDefault();
        if (busy || pending || !form.reportValidity()) return;
        const data = {request_id:requestId, ...Object.fromEntries(controls.map(c => [c.node.name, c.node.value.trim()])),
          category:category.node.value || null};
        if (validity?.node.value === 'days') data.valid_days = days.valueAsNumber;
        busy = true; fields.disabled = preview.disabled = true; message.textContent = deducting?'正在核对可用积分…':'正在核对收款账号…';
        try {
          const result = await post('preview', data);
          if (result.applied) { finish(result); if (!deducting) await reloadHistory(); return; }
          setStep(1);ready = {...data, preview_token:result.preview_token};
          previewBox.replaceChildren(facts(result,deducting));
          preview.hidden = true; confirm.hidden = revise.hidden = false; confirm.textContent = `确认${verb} ${result.amount} 积分`;
          message.textContent = deducting ? '请核对目标账号、扣减积分和原因。' : '请核对收款账号、积分数、类别、有效期和来源依据，确认后入账。';
        } catch (error) { edit(); message.textContent = error.message; }
        finally { busy = false; preview.disabled = false; if (!ready && !pending && next.hidden) fields.disabled = false; }
      };
      try {
        const saved = sessionStorage.getItem(storageKey);
        if (saved) {
          pending = JSON.parse(saved); requestId = pending.request_id; uncertain = true;
          controls.forEach(c => { c.node.value = pending[c.node.name] || ''; });
          category.node.value = pending.category || (deducting?'':'gift');
          if (validity) {
            validity.node.value = pending.valid_days ? 'days' : 'permanent';
            days.value = pending.valid_days || ''; updateValidity();
          }
          fields.disabled = true; preview.hidden = true; confirm.hidden = false; confirm.textContent = '重试确认结果';
          message.textContent = `有一笔结果待确认的${verb}，请重试同一请求。请求编号：` + requestId;
        }
      } catch (_) {
        fields.disabled = true; preview.hidden = true;
        message.textContent = `无法读取上次${verb}请求，请恢复浏览器会话存储后重新打开，避免重复操作。`;
      }
    }
    const history = el('section', undefined, 'card'), filters = el('form', undefined, 'toolbar');
    history.dataset.creditPanel=deducting?'deduction-history':'history';history.setAttribute('role','tabpanel');
    history.append(el('h2', deducting?'管理员扣减记录':'赠送来源记录'));
    const metrics=el('div',undefined,'management-kpis');history.append(metrics);
    const username = input(deducting?'扣减账号（精确筛选）':'收款账号（精确筛选）', 'username', 64);
    const request = input(deducting?'扣减请求编号（精确筛选）':'请求编号（精确筛选）', 'request_id', 36);
    username.node.required = request.node.required = false;
    const search = el('button', '查询记录'); search.type = 'submit';
    const latest = button('最新记录', () => { cursor = null; load(); });
    const older = button('更早记录', () => { cursor = nextCursor; load(); }); older.hidden = true;
    const rows = el('div'), status = el('p'); status.setAttribute('role', 'status');
    let cursor = null, nextCursor = null, generation = 0, activeFilters = {};
    const load = async () => {
      const serial = ++generation;
      older.disabled = search.disabled = latest.disabled = true;
      status.textContent = `正在查询${verb}记录…`;
      const params = new URLSearchParams(activeFilters);
      if (cursor) params.set('before', cursor);
      try {
        const result = await api(base + '?' + params);
        if (serial !== generation) return;
        nextCursor = result.next; older.hidden = !nextCursor; rows.replaceChildren();metrics.replaceChildren();
        const movement=deducting?'扣减':'发放';
        for(const [label,value] of [['本页'+movement+'笔数',result.entries.length],['本页'+movement+'积分',result.entries.reduce((n,e)=>n+BigInt(e.amount),0n).toString()],[deducting?'本页扣减账号':'本页收款账号',new Set(result.entries.map(e=>e.target.id)).size]]){const metric=el('div');metric.append(el('span',label),el('strong',String(value)));metrics.append(metric);}
        const table=el('table'),head=el('thead'),headRow=el('tr'),tbody=el('tbody');
        const columns = deducting ? ['目标账号','扣减积分','扣减类别','扣减时间','操作人','原因与凭证']
          : ['收款账号','发放积分','积分类别','发放时间','有效期','操作人','来源与凭证'];
        columns.forEach(name=>headRow.append(el('th',name)));head.append(headRow);table.append(head,tbody);const scroll=el('div',undefined,'table-wrap');scroll.append(table);rows.append(scroll);
        for (const entry of result.entries) {
          const amount = (deducting?'−':'+')+entry.amount, time = new Date(entry.created_at).toLocaleString();
          const details = el('details'), summary = el('summary', deducting?entry.reason:`${entry.target.username} · ${amount} 积分 · ${time}`);
          details.append(summary, facts(entry,deducting));
          const values = [entry.target.display_name+' / '+entry.target.username, amount,
            deducting?deductionCategory(entry.category):categoryName(entry.category), time,
            ...(!deducting?[expiryName(entry)]:[]), entry.actor.display_name+' / '+entry.actor.username, details];
          const tr=el('tr');for(const value of values){const td=el('td');td.append(value instanceof Node?value:document.createTextNode(value));tr.append(td);}tbody.append(tr);
        }
        status.textContent = result.entries.length ? '可按请求编号关联操作审计。' : `暂无符合条件的${verb}记录。`;
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
    return reloadHistory;
  }
  async function create(options) {
    const root = el('div', undefined, 'credit-gifts');
    const tabs=el('div',undefined,'management-tabs');tabs.setAttribute('role','tablist');tabs.setAttribute('aria-label','积分管理');root.append(tabs);
    root.append(el('p', '赠送和扣减均由管理员核对后确认。扣减仅使用未冻结、未过期的积分。', 'muted'));
    const reloadGifts = mountOperation(root,options,false);
    const reloadDeductions = mountOperation(root,options,true);
    function showTab(key) {
      root.querySelectorAll('[data-credit-panel]').forEach(p=>p.hidden=p.dataset.creditPanel!==key);
      tabs.querySelectorAll('button').forEach(b=>b.setAttribute('aria-selected',String(b.dataset.panel===key)));
      if (key==='deduction-history') void reloadDeductions();
    }
    for (const [key,title] of [...(options.canGift?[['grant','发放积分'],['deduct','积分扣减 / 冲正']]:[]),
      ['history','发放记录'],['deduction-history','扣减记录']]) {
      const tab=button(title,()=>showTab(key));tab.dataset.panel=key;tab.setAttribute('role','tab');tabs.append(tab);
    }
    showTab(options.canGift?'grant':'history');
    await reloadGifts();
    return root;
  }
  window.ManagementCreditGifts = {create};
})();
