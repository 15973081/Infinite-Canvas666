/* Display only server-computed usage/cost; never calculate a bill in the client. */
(() => {
  function decorate(bubble, cost) {
    if (!cost || cost.kind !== 'chat') return;
    const note = document.createElement('div');
    note.className = 'chat-cost-note';
    const usage = cost.usage;
    const counts = usage ? `输入 ${usage.input_tokens} · 输出 ${usage.output_tokens} Token${usage.cached_input_tokens ? ` · 缓存 ${usage.cached_input_tokens}` : ''}` : '';
    const mode = ({per_call:'按次计费',per_million_tokens:'Token 计费',disabled:'不计费'})[cost.billing_type] || '尚未配置价格';
    let amount = cost.status === 'unknown' ? '费用待核算' : '不计费';
    if (cost.status === 'priced') {
      const value = BigInt(cost.amount_micros || 0);
      amount = '¥' + (value / 1000000n) + '.' + (value % 1000000n).toString().padStart(6,'0').replace(/0+$/,'').padEnd(2,'0');
    }
    note.textContent = [mode, counts, amount].filter(Boolean).join(' · ');
    note.title = '根据本次调用的服务端价格快照核算';
    bubble.appendChild(note);
  }
  window.ChatCost = {decorate};
})();
