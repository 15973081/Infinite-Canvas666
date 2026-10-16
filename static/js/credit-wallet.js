/* Personal credits are separate from provider-cost reports. */
(() => {
  const el = (tag, text, cls) => {
    const node = document.createElement(tag);
    if (text !== undefined) node.textContent = text;
    if (cls) node.className = cls;
    return node;
  };
  const points = value => BigInt(value).toLocaleString('zh-CN');
  const sources = {RECHARGE:'充值', RECHARGE_GIFT:'充值赠送', PLATFORM_GIFT:'平台赠送'};
  function create({fetchReport, isActive = () => true}) {
    const root = el('section', undefined, 'billing-view credit-wallet');
    const summary = el('div', undefined, 'billing-overview');
    const toolbar = el('div', undefined, 'billing-toolbar');
    const label = el('label', '积分分类'), category = el('select');
    category.setAttribute('aria-label', '积分分类');
    for (const [value, text] of [['','全部'],['recharge','充值积分'],['gift','赠送积分']]) category.append(new Option(text,value));
    label.append(category);
    const refresh = el('button','刷新'), previous = el('button','上一页'), next = el('button','下一页');
    for (const button of [refresh, previous, next]) button.type = 'button';
    toolbar.append(label, refresh);
    const message = el('p','','billing-note'); message.setAttribute('role','status');
    const rows = el('div',undefined,'billing-scroll'), pager = el('div',undefined,'billing-pager');
    const position = el('span','','billing-page-number'); pager.append(previous,position,next);
    root.append(summary, el('p','余额包含全部积分；下方按充值与赠送来源筛选。','billing-note'),toolbar,message,rows,pager);
    let version=0, page=1, pages=1, busy=false, stopped=false, controller;
    function controls() {
      previous.disabled=stopped || busy || page<=1;
      next.disabled=stopped || busy || page>=pages;
      category.disabled=refresh.disabled=stopped;
      root.setAttribute('aria-busy',String(busy));
    }
    function pause() {
      if(stopped)return;
      stopped=true;version++;controller?.abort();busy=false;
      summary.replaceChildren();rows.replaceChildren();position.textContent='';
      message.textContent='登录状态已变化，请重新打开积分页面。';controls();
    }
    function render(data) {
      const cards = el('div',undefined,'billing-totals');
      for (const [key,title] of [['total_balance','总积分'],['recharge_balance','充值积分'],['gift_balance','赠送积分']]) {
        const card=el('div',undefined,'billing-total');card.append(el('span',title),el('strong',points(data.wallet[key])));cards.append(card);
      }
      summary.replaceChildren(cards);
      const table=el('table'), head=el('thead'), tr=el('tr'), body=el('tbody');
      for(const title of ['时间','分类 / 来源','变动积分','变动后总余额','批次剩余','有效期','备注'])tr.append(el('th',title));
      head.append(tr);table.append(head,body);
      for(const entry of data.entries){
        const row=el('tr');
        const values=[new Date(entry.created_at).toLocaleString('zh-CN'),
          (entry.category==='recharge'?'充值积分':'赠送积分')+' / '+(sources[entry.source]||entry.source),
          (entry.type==='ADD'?'+':'−')+points(entry.amount),points(entry.balance_after),points(entry.remaining_amount),
          entry.validity==='PERMANENT'?'永久有效':'待核实',entry.note||'—'];
        for(const value of values)row.append(el('td',value));body.append(row);
      }
      rows.replaceChildren(table);
      if(!data.entries.length)rows.replaceChildren(el('p','暂无积分流水','billing-note'));
      page=data.page;pages=data.pages;position.textContent=page+' / '+pages;
      message.textContent='共 '+data.records+' 笔记录。';
    }
    async function load(target=1){
      if(stopped)return;
      if(!isActive()){pause();return;}
      const stamp=++version;controller?.abort();controller=new AbortController();
      busy=true;controls();summary.replaceChildren();rows.replaceChildren();position.textContent='';message.textContent='正在读取积分…';
      try{
        const data=await fetchReport({category:category.value,page:target,page_size:25},controller.signal);
        if(stopped||stamp!==version)return;
        if(!isActive()){pause();return;}
        render(data);
      }catch(error){
        if(stopped||stamp!==version)return;
        if(!isActive()||error.status===401||error.status===409){pause();return;}
        page=pages=1;message.textContent='积分读取失败，请点击刷新重试。';
      }finally{if(stamp===version){busy=false;controls();}}
    }
    category.onchange=()=>void load(1);refresh.onclick=()=>void load(1);
    previous.onclick=()=>{if(!busy&&page>1)void load(page-1);};
    next.onclick=()=>{if(!busy&&page<pages)void load(page+1);};
    window.addEventListener('member-session:paused',pause);
    controls();void load();
    return {element:root,dispose(){stopped=true;version++;controller?.abort();window.removeEventListener('member-session:paused',pause);}};
  }
  function show(){
    const boundMember=window.CanvasSession?.context?.member?.id;
    if(!boundMember||window.CanvasSession.paused)throw new Error('请重新登录后查看积分。');
    if(!document.getElementById('billing-view-style')){
      const css=el('link');css.id='billing-view-style';css.rel='stylesheet';css.href='/static/css/billing-view.css?v=2026.10.16.1';document.head.append(css);
    }
    const dialog=el('dialog',undefined,'billing-dialog billing-personal-dialog');dialog.setAttribute('aria-label','我的积分');
    const header=el('header'),close=el('button','×','billing-close');close.type='button';close.setAttribute('aria-label','关闭我的积分');close.onclick=()=>dialog.close();
    header.append(el('h1','我的积分'),close);
    const view=create({isActive:()=>!window.CanvasSession.paused&&window.CanvasSession.context?.member?.id===boundMember,
      fetchReport:async(params,signal)=>{
        const response=await fetch('/api/account/credits?'+new URLSearchParams(params),{signal,cache:'no-store',headers:{'X-Member-ID':boundMember}});
        if(!response.ok){const error=new Error('积分读取失败');error.status=response.status;throw error;}
        return response.json();
      }});
    dialog.append(header,view.element);document.body.append(dialog);
    dialog.addEventListener('close',()=>{view.dispose();dialog.remove();},{once:true});dialog.showModal();
  }
  window.CanvasCreditWallet={create,show};
})();
