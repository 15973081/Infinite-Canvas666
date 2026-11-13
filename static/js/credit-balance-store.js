/* One wallet snapshot per member; report reads and balance refreshes share ordering. */
(() => {
  const listeners = new Set();
  let memberId = null, wallet = null, sequence = 0, controller;
  const currentMember = () => window.CanvasSession?.paused ? null : window.CanvasSession?.context?.member?.id;
  function notify() { for (const listener of listeners) listener(wallet); }
  function reset(id = null) {
    sequence++; controller?.abort(); controller = null;
    memberId = id; wallet = null; notify();
  }
  function bindMember() {
    const id = currentMember();
    if (id !== memberId) reset(id);
    return id;
  }
  function beginRead() {
    const id = bindMember();
    controller?.abort(); controller = null;
    return {memberId:id, sequence:++sequence};
  }
  function publish(value, ticket) {
    if (!ticket.memberId || ticket.memberId !== currentMember() || ticket.memberId !== memberId || ticket.sequence !== sequence) return false;
    const {total_balance,recharge_balance,gift_balance} = value;
    wallet = {total_balance,recharge_balance,gift_balance}; notify(); return true;
  }
  async function refresh() {
    const ticket = beginRead();
    if (!ticket.memberId) return;
    const request = new AbortController(); controller = request;
    try {
      const response = await fetch('/api/account/credits?page_size=1', {
        cache:'no-store', signal:request.signal, headers:{'X-Member-ID':ticket.memberId}
      });
      if (!response.ok) throw new Error('余额读取失败，请重试。');
      const data = await response.json();
      publish(data.wallet, ticket);
    } catch (error) {
      if (request.signal.aborted || ticket.sequence !== sequence || ticket.memberId !== currentMember()) return;
      throw error;
    } finally { if (controller === request) controller = null; }
  }
  window.addEventListener('member-session:paused', () => reset());
  window.CanvasCreditBalance = {
    get value() { bindMember(); return wallet; }, beginRead, publish, refresh,
    subscribe(listener) {
      bindMember(); listeners.add(listener); listener(wallet);
      return () => listeners.delete(listener);
    }
  };
})();
