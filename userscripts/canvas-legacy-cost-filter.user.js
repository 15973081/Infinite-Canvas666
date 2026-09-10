// ==UserScript==
// @name         普通画布 · 旧版按秒费用核算
// @namespace    infinite-canvas-local
// @version      2.1.0
// @description  按日期核算旧版秒价费用，支持历史价格、手动补价及 CSV 导出；不改写原账单。
// @match        *://*/canvas*
// @match        *://*/static/canvas.html*
// @run-at       document-idle
// @grant        none
// @sandbox      raw
// ==/UserScript==

(() => {
  'use strict';
  // The main application hosts /static/canvas.html in #frame-canvas.
  // Run in that frame's page context so its lexical canvas/nodes bindings are accessible.
  if (window.__canvasLegacyCostFilter) return;
  window.__canvasLegacyCostFilter = true;
  const id = 'tm-canvas-cost-filter';
  let aside, lastSignature = '', activePanel;
  let calendarMonth = new Date(), rangeAnchor = '';
  const calculator = createLegacyCostCalculator();
  const storageKey = 'canvas-legacy-seconds-prices-v2';
  let manualRules = [], storageError = '', currentRows = [], modelOptions = [];
  let updateSequence = 0;
  const ledgerCache = new Map();
  async function retainedLogs(current, force=false) {
    if (!window.CanvasLedger?.readAll || !current.id) return {logs:current.logs, independent:false};
    const revision = window.CanvasLedger.revision(current.id);
    let cached = ledgerCache.get(current.id);
    if (cached?.promise) return cached.promise;
    if (!force && cached?.result && cached.revision === revision && Date.now()-cached.at < 5000) return cached.result;
    cached = {revision, at:Date.now()};
    ledgerCache.set(current.id, cached);
    cached.promise = window.CanvasLedger.readAll(current.id).then(result => {
      cached.result = {logs:result.logs, independent:true};
      cached.revision = result.revision;
      return cached.result;
    }).finally(() => {cached.promise = null;});
    return cached.promise;
  }
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) || '[]');
    if (!Array.isArray(saved) || saved.some(rule => !rule || typeof rule !== 'object' || !rule.providerId || !rule.model)) throw new Error('价格配置格式无效');
    manualRules = saved;
  } catch (error) { storageError = `本机补价配置读取失败：${error.message}`; }

  // This calculator deliberately does not call the application's video/token cost hook.
  function createLegacyCostCalculator() {
    const validAmount = value => value !== null && value !== '' && value !== undefined
      && Number.isSafeInteger(Number(value)) && Number(value) >= 0;
    const cny = value => !value || value === 'CNY';
    function fraction(value) {
      if (value === null || value === undefined || typeof value === 'boolean') return null;
      const match = String(value).trim().match(/^(\d*)(?:\.(\d*))?(?:e([+-]?\d+))?$/i);
      if (!match || !(match[1] || match[2]) || !Number.isFinite(Number(value)) || Number(value) < 0) return null;
      const scale = (match[2] || '').length - Number(match[3] || 0);
      if (Math.abs(scale) > 30 || String(value).length > 80) return null;
      const n = BigInt((match[1] || '0') + (match[2] || ''));
      return scale >= 0 ? [n, 10n ** BigInt(scale)] : [n * 10n ** BigInt(-scale), 1n];
    }
    function amountMicros(price, quantity) {
      const p = fraction(price), q = fraction(quantity);
      if (!p || !q) return null;
      // Match the old scheme: round the unit price to micro-yuan, then multiply seconds/images.
      const unit = (p[0] * 1000000n * 2n + p[1]) / (2n * p[1]);
      const amount = (unit * q[0] * 2n + q[1]) / (2n * q[1]);
      return amount <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(amount) : null;
    }
    function identity(log, providers = [], identityHook) {
      let hint = {};
      try { hint = identityHook?.({}, log) || {}; } catch (_) { /* Older hook may not exist. */ }
      const providerId = log.providerId || log.request?.provider_id || log.cost?.providerId || hint.providerId
        || providers.find(p => p.name === log.platform || p.id === log.platform)?.id || '';
      const model = log.billingModel || log.request?.model || hint.model || log.cost?.model || log.video_info?.requested_model || log.model || '';
      const kind = log.billingKind || log.cost?.kind || hint.kind || (log.nodeType === 'video' || log.kind === 'video'
        || log.cost?.billing_type === 'per_second' || log.video_info ? 'video'
        : ['generator', 'msgen'].includes(log.nodeType) || log.kind === 'image' ? 'image' : '');
      return {providerId, model, kind,
        resolution:String(log.request?.resolution || log.video_info?.requested_resolution || log.video_info?.resolution || '').toLowerCase(),
        has_video_input:typeof log.video_info?.has_video_input === 'boolean' ? log.video_info.has_video_input
          : Array.isArray(log.request?.videos) ? log.request.videos.length > 0 : undefined,
        service_tier:log.request?.service_tier || log.video_info?.service_tier || 'default'};
    }
    const url = value => typeof value === 'string' ? value : value?.url || '';
    function indexMedia(nodes = []) {
      const index = new Map();
      for (const node of nodes) for (const item of node.images || []) {
        const key = url(item);
        if (!key) continue;
        if (!index.has(key)) index.set(key, []);
        index.get(key).push(item);
      }
      return index;
    }
    function duration(log, mediaIndex = new Map()) {
      const choices = [
        [log.cost?.billing_type === 'per_second' ? log.cost.quantity : null, '旧计费秒数'],
        [log.durationSeconds, '日志时长'], [log.request?.duration, '请求时长'],
        [log.video_info?.duration, '视频返回时长'], [log.run?.node?.duration, '历史任务时长']
      ];
      for (const output of log.outputs || []) {
        const items = [typeof output === 'object' ? output : null, ...(mediaIndex.get(url(output)) || [])];
        for (const item of items) if (item) choices.push(
          [item.run?.node?.duration || item.run?.request?.duration, '输出关联任务时长'],
          [item.video_info?.duration, '输出视频返回时长']
        );
      }
      for (const [value, source] of choices) if (fraction(value) && Number(value) > 0) return {seconds:Number(value), duration_source:source};
      return {seconds:0, duration_source:'缺少视频时长'};
    }
    function priceAt(rows, info, at, manual = false) {
      if (!Number.isFinite(at) || at <= 0) return null;
      return rows.filter(row => row && row.model === info.model && (manual ? row.providerId === info.providerId : row.kind === info.kind)
        && row.billing_type === (info.kind === 'video' ? 'per_second' : 'per_image')
        && cny(row.currency) && fraction(row.unit_price)
        && (!row.resolution || (row.resolution === '__unknown__' ? !info.resolution : String(row.resolution).toLowerCase() === info.resolution))
        && (manual && row.has_video_input === null ? info.has_video_input === undefined
          : typeof row.has_video_input !== 'boolean' || row.has_video_input === info.has_video_input)
        && (!row.service_tier || row.service_tier === info.service_tier)
        && Number(row.effective_from || 0) <= at
        && (!Number(row.effective_to || 0) || at < Number(row.effective_to)))
        .sort((a, b) => Number(b.effective_from || 0) - Number(a.effective_from || 0)
          || Number(Boolean(b.resolution)) - Number(Boolean(a.resolution)))[0] || null;
    }
    function costFor(log, options = {}) {
      if (log.status === 'failed') return null;
      const info = identity(log, options.providers, options.identityHook);
      const unknown = reason => ({...info, status:'unknown', reason});
      const saved = log.cost;
      if (info.kind !== 'video') {
        if (saved?.status === 'priced' && validAmount(saved.amount_micros) && cny(saved.currency)) return {...saved, kind:info.kind || saved.kind, price_source:'原费用快照'};
        if (info.kind !== 'image') return unknown('无法识别图片或视频类型');
        // Images retain the application's existing per-image accounting.
        try {
          const cost = options.imageHook?.(log);
          if (cost?.status === 'priced' && validAmount(cost.amount_micros) && cny(cost.currency)) return {...cost, kind:'image', price_source:'图片历史价格'};
        } catch (_) { /* Fall back to the same historical per-image price table. */ }
        const provider = (options.providers || []).find(p => p.id === info.providerId);
        const price = priceAt(provider?.model_prices || [], info, Number(log.createdAt || log.created_at));
        const quantity = Math.max(1, (log.outputs || []).length);
        const amount = price && amountMicros(price.unit_price, quantity);
        return amount === null || !price ? unknown('缺少图片历史单价')
          : {...info, status:'priced', currency:'CNY', source:'estimated', amount_micros:amount, quantity, unit_price:String(price.unit_price), price_source:'图片历史价格'};
      }
      const time = duration(log, options.mediaIndex);
      if (!time.seconds) return unknown('缺少视频时长（不使用生成耗时或 Token 数）');
      let price, priceSource;
      if (saved?.billing_type === 'per_second' && cny(saved.currency) && fraction(saved.unit_price)) {
        price = saved; priceSource = '旧日志秒价快照';
      } else {
        const provider = (options.providers || []).find(p => p.id === info.providerId);
        const at = Number(log.createdAt || log.created_at);
        price = priceAt(provider?.model_prices || [], info, at);
        priceSource = '调用当时的历史秒价';
        if (!price) { price = priceAt(options.manualRules || [], info, at, true); priceSource = '本机手动补价'; }
      }
      if (!price) return {...unknown('缺少旧版元/秒单价'), ...time};
      const amount = amountMicros(price.unit_price, time.seconds);
      if (amount === null) return {...unknown('单价或金额超出可计算范围'), ...time};
      return {...info, ...time, status:'priced', source:price === saved && saved.status === 'priced' && Number(saved.quantity) > 0 && saved.source !== 'estimated' ? 'actual' : 'estimated',
        currency:'CNY', billing_type:'per_second', quantity:time.seconds, unit_price:String(price.unit_price), amount_micros:amount, price_source:priceSource};
    }
    return {costFor, identity, indexMedia, amountMicros, validAmount};
  }
  const money = value => `¥${new Intl.NumberFormat('zh-CN', {
    minimumFractionDigits: 2, maximumFractionDigits: 6,
  }).format(value / 1000000)}`;
  const dateText = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  function boundary(value, nextDay = false) {
    if (!value) return nextDay ? Infinity : -Infinity;
    const [y, m, d] = value.split('-').map(Number);
    const date = new Date(y, m - 1, d);
    if (dateText(date) !== value) throw new Error('请选择有效日期');
    if (nextDay) date.setDate(date.getDate() + 1);
    return date.getTime();
  }
  function context() {
    return {providers:typeof apiProviders === 'undefined' ? [] : apiProviders,
      identityHook:typeof billingIdentity === 'function' ? billingIdentity : undefined,
      imageHook:typeof generationLogCost === 'function' ? generationLogCost : undefined,
      mediaIndex:calculator.indexMedia(typeof nodes === 'undefined' ? [] : nodes), manualRules};
  }
  function summarize(logs, start, end, options = context()) {
    const from = boundary(start), until = boundary(end, true);
    if (from >= until) throw new Error('开始日期不能晚于结束日期');
    const rows = [], totals = { total: 0, image: 0, video: 0, estimated: 0, unknown: 0, failed: 0, calls: 0, invalid: 0 };
    for (const log of logs) {
      const at = Number(log.createdAt || log.created_at);
      if (!Number.isFinite(at) || at <= 0) { totals.invalid++; continue; }
      if (at < from || at >= until) continue;
      const cost = calculator.costFor(log, options);
      if (log.status === 'failed') totals.failed++;
      else if (cost?.status === 'priced' && calculator.validAmount(cost.amount_micros) && (!cost.currency || cost.currency === 'CNY')) {
        const amount = Number(cost.amount_micros);
        totals.total += amount;
        if (cost.kind === 'image' || cost.kind === 'video') totals[cost.kind] += amount;
        if (cost.source === 'estimated') totals.estimated += amount;
        totals.calls++;
        if (!Number.isSafeInteger(totals.total)) throw new Error('汇总金额超出精确计算范围，未显示合计');
      } else totals.unknown++;
      rows.push({ log, cost, at });
    }
    rows.sort((a, b) => b.at - a.at);
    return { rows, totals };
  }
  function renderPrices(logs, options) {
    const select = aside.querySelector('[name=price-model]');
    const previous = select.value;
    const unique = new Map();
    for (const log of logs) {
      const info = calculator.identity(log, options.providers, options.identityHook);
      if (info.kind !== 'video' || !info.model || !info.providerId) continue;
      const key = JSON.stringify([info.providerId, info.model, info.resolution, info.has_video_input, info.service_tier]);
      unique.set(key, {...info, key, platform:log.platform || info.providerId});
    }
    modelOptions = [...unique.values()];
    const signature = JSON.stringify(modelOptions);
    if (select.dataset.signature !== signature) {
      select.replaceChildren();
      for (const info of modelOptions) {
        const option = document.createElement('option');
        option.value = info.key;
        option.textContent = `${info.platform} / ${info.model} / ${info.resolution || '未记录分辨率'}${typeof info.has_video_input === 'boolean' ? (info.has_video_input ? ' / 含视频输入' : ' / 无视频输入') : ' / 未记录视频输入'} / ${info.service_tier}`;
        select.append(option);
      }
      if (modelOptions.some(info => info.key === previous)) select.value = previous;
      select.dataset.signature = signature;
    }
    const list = aside.querySelector('.price-rules');
    list.replaceChildren();
    manualRules.forEach((rule, index) => {
      const row = document.createElement('div');
      row.className = 'detail';
      const text = document.createElement('span');
      text.textContent = `${rule.providerId} / ${rule.model} / ${rule.resolution === '__unknown__' ? '未记录分辨率' : rule.resolution || '所有分辨率'}`
        + (typeof rule.has_video_input === 'boolean' ? (rule.has_video_input ? ' / 含视频输入' : ' / 无视频输入') : ' / 未记录视频输入')
        + ` / ${rule.service_tier || '所有档位'} · ¥${rule.unit_price}/秒 · ${rule.start || '不限'} 至 ${rule.end || '不限'} `;
      const button = document.createElement('button');
      button.textContent = '删除'; button.dataset.deletePrice = String(index);
      row.append(text, button); list.append(row);
    });
  }
  function persistPrices(rules) {
    localStorage.setItem(storageKey, JSON.stringify(rules));
    manualRules = rules;
    storageError = '';
    update(true);
  }
  function savePrice() {
    const message = aside.querySelector('.price-message');
    try {
      const info = modelOptions.find(item => item.key === aside.querySelector('[name=price-model]').value);
      if (!info) throw new Error('当前画布没有可识别平台和模型的视频日志');
      const unit = aside.querySelector('[name=second-price]').value.trim();
      if (calculator.amountMicros(unit, 1) === null) throw new Error('请输入有效的非负元/秒单价，免费请填 0');
      const start = aside.querySelector('[name=price-start]').value;
      const end = aside.querySelector('[name=price-end]').value;
      const from = boundary(start), until = boundary(end, true);
      if (from >= until) throw new Error('单价开始日期不能晚于结束日期');
      const rule = {providerId:info.providerId, model:info.model, kind:'video', billing_type:'per_second', currency:'CNY',
        resolution:info.resolution || '__unknown__', service_tier:info.service_tier, unit_price:unit,
        effective_from:start ? from : 0, effective_to:end ? until : 0, start, end};
      rule.has_video_input = typeof info.has_video_input === 'boolean' ? info.has_video_input : null;
      const sameScope = item => item.providerId === rule.providerId && item.model === rule.model && item.resolution === rule.resolution
        && item.has_video_input === rule.has_video_input && item.service_tier === rule.service_tier;
      const remaining = manualRules.filter(item => !(sameScope(item) && item.effective_from === rule.effective_from && item.effective_to === rule.effective_to));
      if (remaining.some(item => sameScope(item) && Math.max(item.effective_from || 0, rule.effective_from) < Math.min(item.effective_to || Infinity, rule.effective_to || Infinity))) {
        throw new Error('同一规格已有日期重叠的补价，请先删除旧规则');
      }
      persistPrices([...remaining, rule]);
      message.textContent = '已保存到本机；仅补充缺少旧秒价的记录。';
    } catch (error) { message.textContent = error.message; }
  }
  function exportCSV() {
    update(true);
    if (!currentRows.length) return;
    const headers = ['时间', '日志ID', '平台', '模型', '分辨率', '状态', '视频秒数', '元每秒', '核算金额元', '价格来源', '时长来源', '待核算原因', '原账单金额', '原币种', '原计费类型'];
    const records = currentRows.map(({log, cost, at}) => [new Date(at).toLocaleString('zh-CN'), log.id, log.platform,
      cost?.model || log.billingModel || log.model, cost?.resolution, log.status, cost?.seconds ?? '',
      cost?.billing_type === 'per_second' ? cost.unit_price : '',
      cost?.status === 'priced' ? (Number(cost.amount_micros) / 1000000).toFixed(6) : '',
      cost?.price_source, cost?.duration_source, cost?.reason,
      log.cost?.status === 'priced' && calculator.validAmount(log.cost.amount_micros) ? (Number(log.cost.amount_micros) / 1000000).toFixed(6) : '',
      log.cost?.currency || 'CNY', log.cost?.billing_type]);
    const cell = value => {
      let text = String(value ?? '');
      if (/^\s*[=+\-@\t\r]/.test(text)) text = "'" + text;
      return '"' + text.replaceAll('"', '""') + '"';
    };
    const csv = '\uFEFF' + [headers, ...records].map(row => row.map(cell).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], {type:'text/csv;charset=utf-8'}));
    const link = document.createElement('a');
    link.href = url; link.download = `画布旧秒价核算-${dateText(new Date())}.csv`;
    link.hidden = true; document.body.append(link);
    link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function setDates(start, end) {
    aside.querySelector('[name=start]').value = start;
    aside.querySelector('[name=end]').value = end;
    rangeAnchor = '';
    if (start) calendarMonth = new Date(boundary(start));
    renderCalendar();
    update(true);
  }
  function renderCalendar() {
    const year = calendarMonth.getFullYear(), month = calendarMonth.getMonth();
    const start = aside.querySelector('[name=start]').value;
    const end = aside.querySelector('[name=end]').value;
    aside.querySelector('[name=calendar-month]').value = `${year}-${String(month + 1).padStart(2, '0')}`;
    aside.querySelector('.calendar-hint').textContent = rangeAnchor
      ? `已选 ${rangeAnchor}，再点一天完成范围（同一天点两次）`
      : '先点开始日期，再点结束日期；支持跨月选择。';
    const grid = aside.querySelector('.calendar-days');
    const focused = grid.contains(document.activeElement) ? document.activeElement.dataset.day : '';
    grid.replaceChildren();
    const offset = (new Date(year, month, 1).getDay() + 6) % 7;
    for (let i = 0; i < offset; i++) grid.append(document.createElement('span'));
    for (let day = 1; day <= new Date(year, month + 1, 0).getDate(); day++) {
      const value = dateText(new Date(year, month, day));
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.day = value;
      button.textContent = day;
      button.setAttribute('aria-label', value);
      const selected = rangeAnchor ? value === rangeAnchor : value === start || value === end;
      button.setAttribute('aria-pressed', String(selected));
      if (selected) button.classList.add('selected');
      if (!rangeAnchor && start && end && value > start && value < end) button.classList.add('in-range');
      if (value === dateText(new Date())) button.setAttribute('aria-current', 'date');
      grid.append(button);
    }
    if (focused) grid.querySelector(`[data-day="${focused}"]`)?.focus({preventScroll:true});
  }
  function mount() {
    const style = document.createElement('style');
    style.textContent = `
      .tm-cost-panel {width:min(860px,calc(94vw - 330px))!important;transform:translateX(-165px)}
      #${id}{position:fixed;z-index:2147483000;width:306px;box-sizing:border-box;overflow:auto;padding:18px;border:1px solid var(--line,#d6dce5);border-radius:18px;background:var(--card-solid,#fff);color:var(--text,#172033);box-shadow:0 20px 60px #0002;font:13px/1.6 system-ui,sans-serif}
      #${id}[hidden]{display:none!important} #${id} *{box-sizing:border-box}
      #${id} h3{margin:0 0 12px;font-size:17px} #${id} label{display:block;margin:8px 0}
      #${id} input,#${id} select{display:block;width:100%;padding:7px 10px;margin-top:4px;border:1px solid var(--line,#ccd4e0);border-radius:8px;background:var(--card-solid,#fff);color:inherit;font:inherit;color-scheme:light dark}
      #${id} button{cursor:pointer;padding:5px 10px;border:1px solid var(--line,#ccd4e0);border-radius:7px;background:transparent;color:inherit;font:inherit}
      #${id} .shortcuts{display:flex;gap:6px;flex-wrap:wrap;margin:12px 0}
      #${id} .calendar{margin:12px 0;border:1px solid var(--line,#dce1ec);border-radius:12px;padding:0 10px 10px}
      #${id} .calendar summary{color:#6875e8;font-weight:600}
      #${id} .calendar-nav{display:flex;align-items:center;gap:6px;margin-bottom:8px}
      #${id} .calendar-nav input{min-width:0;flex:1;margin:0;padding:5px;font-size:12px}
      #${id} .calendar-nav button{padding:4px 10px;font-size:17px}
      #${id} .calendar-week,#${id} .calendar-days{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:3px;text-align:center}
      #${id} .calendar-week{font-size:11px;opacity:.6;margin-bottom:4px}
      #${id} .calendar-days button{border:0;padding:4px 0;min-height:29px;font-size:12px}
      #${id} button:hover{background:#6875e819} #${id} button:focus-visible{outline:2px solid #6875e8;outline-offset:2px}
      #${id} .calendar-days .in-range{background:#6875e820;color:inherit;border-radius:3px}
      #${id} .calendar-days .selected{background:#6875e8;color:white}
      #${id} .calendar-days [aria-current=date]{box-shadow:inset 0 0 0 1px #6875e8}
      #${id} .calendar-hint{margin-top:8px;min-height:36px}
      #${id} .total{font-size:26px;font-weight:700;color:#6875e8} #${id} .muted{font-size:12px;opacity:.72}
      #${id} .detail{padding:10px 0;border-top:1px solid var(--line,#e4e7ed);overflow-wrap:anywhere}
      #${id} .error{color:#e35c5c} #${id} summary{cursor:pointer;margin:12px 0}
      @media(max-width:760px){.tm-cost-panel{width:94vw!important;transform:none!important}#${id}{width:min(306px,88vw);box-shadow:0 12px 50px #0005}}
    `;
    document.head.append(style);
    aside = document.createElement('aside');
    aside.id = id;
    aside.setAttribute('aria-label', '旧版按秒费用核算');
    aside.innerHTML = `<h3>旧版按秒 · 日期核算</h3>
      <p class="muted">视频按旧秒价核算，图片沿用原计费。此处为历史对账口径，不代表火山当前 Token 账单。</p>
      <label>开始日期<input name="start" type="date" aria-label="开始日期"></label>
      <label>结束日期<input name="end" type="date" aria-label="结束日期"></label>
      <details class="calendar"><summary>展开日历选择日期范围</summary>
        <div class="calendar-nav"><button data-month="-1" aria-label="上个月">‹</button><input name="calendar-month" type="month" aria-label="跳转年月"><button data-month="1" aria-label="下个月">›</button></div>
        <div class="calendar-week"><span>一</span><span>二</span><span>三</span><span>四</span><span>五</span><span>六</span><span>日</span></div>
        <div class="calendar-days" role="group" aria-label="选择日期"></div>
        <div class="calendar-hint muted" aria-live="polite"></div>
        <button data-cancel-selection>取消本次选择</button>
      </details>
      <div class="shortcuts"><button data-range="today">今天</button><button data-range="yesterday">昨天</button><button data-range="7">近7天</button><button data-range="30">近30天</button><button data-range="month">本月</button><button data-range="last-month">上月</button><button data-range="all">全部</button><button data-range="refresh">重新计算</button></div>
      <div class="muted">按本机时区，包含结束当天；日期留空表示不限。</div>
      <details class="prices"><summary>补充旧秒价（元/秒）</summary>
        <p class="muted">价格优先级：旧日志秒价快照 → 调用当时的历史秒价 → 本机手动补价。仅精确匹配所选平台、模型与规格，不转换 Token 单价。</p>
        <label>平台 / 模型 / 规格<select name="price-model"></select></label>
        <label>单价（元/秒）<input name="second-price" type="text" inputmode="decimal" placeholder="填写你的历史秒价"></label>
        <label>单价生效日期<input name="price-start" type="date"></label>
        <label>单价结束日期（含当天）<input name="price-end" type="date"></label>
        <p class="muted">日期留空表示不限；相同规格和日期再次保存可更新单价。配置仅存于本浏览器、当前网站。</p>
        <button data-save-price>保存补价并重算</button>
        <div class="price-message muted" aria-live="polite"></div>
        <div class="price-rules"></div>
      </details>
      <div class="storage-error error"></div>
      <div class="result" aria-live="polite"></div>
      <div class="shortcuts"><button data-export>导出筛选明细 CSV</button></div>
      <details><summary>筛选明细 <span class="count"></span></summary><div class="rows"></div></details>
      <p class="muted">新版读取当前画布全部独立流水，兼容旧版画布内的 logs。缺失历史可在左侧“日志恢复”中补录后重算。左侧保持原账单；右侧按旧方案核算，失败和待核算记录不计入合计。时长不是任务运行耗时。</p>`;
    for (const event of ['click', 'pointerdown', 'keydown', 'wheel']) aside.addEventListener(event, e => e.stopPropagation());
    aside.addEventListener('input', e => {
      if (e.target.name === 'calendar-month') {
        if (e.target.value) {
          calendarMonth = new Date(boundary(`${e.target.value}-01`));
          renderCalendar();
        }
        return;
      }
      if (!['start', 'end'].includes(e.target.name)) return;
      rangeAnchor = '';
      if (e.target.value) calendarMonth = new Date(boundary(e.target.value));
      renderCalendar();
      update(true);
    });
    aside.addEventListener('click', e => {
      const button = e.target.closest('button');
      if (!button) return;
      if (button.hasAttribute('data-save-price')) { savePrice(); return; }
      if (button.hasAttribute('data-delete-price')) {
        try { persistPrices(manualRules.filter((_, index) => index !== Number(button.dataset.deletePrice))); }
        catch (error) { aside.querySelector('.price-message').textContent = error.message; }
        return;
      }
      if (button.hasAttribute('data-export')) { exportCSV(); return; }
      if (button.dataset.month) {
        calendarMonth = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + Number(button.dataset.month), 1);
        renderCalendar();
        return;
      }
      if (button.hasAttribute('data-cancel-selection')) { rangeAnchor = ''; renderCalendar(); return; }
      if (button.dataset.day) {
        const day = button.dataset.day;
        if (!rangeAnchor) { rangeAnchor = day; renderCalendar(); }
        else {
          const dates = [rangeAnchor, day].sort();
          setDates(dates[0], dates[1]);
        }
        return;
      }
      const range = button.dataset.range;
      if (!range) return;
      const now = new Date();
      if (range !== 'refresh') {
        let start = new Date(now), end = new Date(now);
        if (range === 'yesterday') { start.setDate(start.getDate() - 1); end = new Date(start); }
        if (range === '7' || range === '30') start.setDate(start.getDate() - Number(range) + 1);
        if (range === 'month') start.setDate(1);
        if (range === 'last-month') {
          start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
          end = new Date(now.getFullYear(), now.getMonth(), 0);
        }
        setDates(range === 'all' ? '' : dateText(start), range === 'all' ? '' : dateText(end));
        return;
      }
      update(true);
    });
    document.body.append(aside);
    renderCalendar();
  }
  async function update(force = false) {
    // 普通画布的 classic script 暴露全局词法变量 canvas，读取不修改。
    if (!document.getElementById('canvasCostToggle')) return;
    const panel = [...document.querySelectorAll('.log-panel.cost-mode')].find(el => el.getClientRects().length && el.closest('.log-modal.open'));
    if (activePanel !== panel) {
      activePanel?.classList.remove('tm-cost-panel');
      activePanel = panel;
      panel?.classList.add('tm-cost-panel');
      force = true;
    }
    if (!panel) { updateSequence++; if (aside) aside.hidden = true; return; }
    panel.classList.add('tm-cost-panel');
    if (!aside) mount();
    aside.hidden = false;
    const rect = panel.getBoundingClientRect();
    aside.style.left = `${innerWidth <= 760 ? Math.max(8, rect.right - Math.min(306, innerWidth * .88) - 8) : rect.right + 12}px`;
    aside.style.top = `${Math.max(8, rect.top)}px`;
    aside.style.maxHeight = `${Math.min(rect.height, innerHeight - Math.max(8, rect.top) - 8)}px`;
    const result = aside.querySelector('.result'), rowsEl = aside.querySelector('.rows');
    const sequence = ++updateSequence;
    try {
      if (typeof canvas === 'undefined') throw new Error('插件已注入，但未读到页面画布变量。请确认脚本在画布页面上下文运行（保留 @sandbox raw、@grant none），而不是脚本管理器的隔离环境。');
      if (!canvas || !Array.isArray(canvas.logs)) throw new Error('尚未读取到当前画布日志，请打开具体画布后重新计算。');
      const canvasId = canvas.id;
      const history = await retainedLogs(canvas, force);
      if (sequence !== updateSequence || canvas.id !== canvasId) return;
      const logs = history.logs;
      const start = aside.querySelector('[name=start]').value, end = aside.querySelector('[name=end]').value;
      const options = context();
      const { rows, totals } = summarize(logs, start, end, options);
      currentRows = rows;
      const signature = JSON.stringify([canvas.id, start, end, totals, rows.map(({ log, cost, at }) => [log.id, at, log.platform, log.model, log.status, cost])]);
      if (!force && signature === lastSignature) return;
      lastSignature = signature;
      renderPrices(logs, options);
      aside.querySelector('.storage-error').textContent = storageError;
      result.innerHTML = `<p class="muted">旧方案筛选合计</p><div class="total">${money(totals.total)}</div>
        <div>图片 ${money(totals.image)} · 视频 ${money(totals.video)}</div>
        <div>其中历史回算/手动补价 ${money(totals.estimated)}</div>
        <div>${rows.length} 条记录 · ${totals.calls} 笔计费</div>
        <div>${totals.unknown} 笔待核算 · ${totals.failed} 笔失败</div>
        <div class="muted">${history.independent ? '全部独立流水' : '画布内保留日志'}：${logs.length} 条</div>
        ${totals.invalid ? `<div class="error">${totals.invalid} 条日期无效，未计入</div>` : ''}
        ${!rows.length ? '<p>所选日期范围内没有记录。</p>' : ''}`;
      aside.querySelector('.count').textContent = `(${rows.length})`;
      rowsEl.replaceChildren();
      for (const { log, cost, at } of rows) {
        const row = document.createElement('div');
        row.className = 'detail';
        const priced = cost?.status === 'priced' && calculator.validAmount(cost.amount_micros) && (!cost.currency || cost.currency === 'CNY');
        const amount = log.status === 'failed' ? '失败，不计费' : priced ? `${money(Number(cost.amount_micros))}${cost.source === 'estimated' ? '（预估）' : ''}` : '待定价/不可计费';
        row.textContent = `${new Date(at).toLocaleString('zh-CN')} · ${log.platform || cost?.providerId || '-'} · ${cost?.model || log.model || '-'} · ${amount}`
          + (cost?.billing_type === 'per_second' ? ` · ${cost.quantity} 秒 × ¥${cost.unit_price}/秒` : '')
          + (cost?.resolution ? ` · ${cost.resolution}` : '')
          + (cost?.price_source ? ` · ${cost.price_source}` : '')
          + (cost?.duration_source ? ` · ${cost.duration_source}` : '')
          + (cost?.reason ? ` · ${cost.reason}` : '');
        rowsEl.append(row);
      }
    } catch (error) {
      if (sequence !== updateSequence) return;
      lastSignature = '';
      currentRows = [];
      result.textContent = error.message;
      rowsEl.replaceChildren();
      aside.querySelector('.count').textContent = '';
    }
  }
  window.addEventListener('canvas-legacy-activity', () => setTimeout(() => update(), 0));
  window.addEventListener('canvas-ledger-updated', () => update());
  window.addEventListener('resize', () => update());
  // Only inspect retained logs while the dashboard is open; no application billing hooks are replaced.
  setInterval(update, 1500);
  update();
})();
